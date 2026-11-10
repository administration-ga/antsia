// Dupliqué de socle/ops/clamav/server.mjs @ 4e1b625040c5f962f166ed74a691f5cee0126e27 — adaptations : jeton obligatoire et comparaison constante, fichier unique borné, délais absolus, santé sans détail interne, concurrence unique, HTTP/2 h2c pour Cloud Run, import sans écoute pour les tests.
import { createHash, timingSafeEqual } from "node:crypto"
import http from "node:http"
import http2 from "node:http2"
import net from "node:net"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const MAX_FILE_BYTES = 60 * 1024 * 1024
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024

class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status }
}

function positiveInteger(value, fallback, maximum) {
  const number = Number(value ?? fallback)
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error("Invalid scanner limit")
  return number
}

export function scannerOptions(env = process.env) {
  return {
    token: env.CLAMAV_TOKEN ?? "",
    http2: env.HTTP2 === "true",
    clamdHost: env.CLAMD_HOST ?? "127.0.0.1",
    clamdPort: positiveInteger(env.CLAMD_PORT, 3310, 65535),
    maxBytes: positiveInteger(env.MAX_BYTES, MAX_FILE_BYTES, MAX_FILE_BYTES),
    scanTimeoutMs: positiveInteger(env.SCAN_TIMEOUT_MS, 45_000, 45_000),
    healthTimeoutMs: positiveInteger(env.HEALTH_TIMEOUT_MS, 5_000, 5_000),
    bodyTimeoutMs: positiveInteger(env.BODY_TIMEOUT_MS, 15_000, 15_000),
  }
}

/** Protocole clamd PING / INSTREAM ; aucune donnée de fichier sur disque. */
function callClamd(options, command, bytes, timeoutMs) {
  return new Promise((resolveReply, reject) => {
    const socket = net.connect(options.clamdPort, options.clamdHost)
    const chunks = []
    let receivedBytes = 0
    const deadline = setTimeout(() => socket.destroy(new Error("clamd_timeout")), timeoutMs)
    socket.on("connect", () => {
      socket.write(`z${command}\0`)
      if (bytes !== undefined) {
        for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
          const chunk = bytes.subarray(offset, Math.min(offset + 64 * 1024, bytes.length))
          const size = Buffer.alloc(4)
          size.writeUInt32BE(chunk.length)
          socket.write(size)
          socket.write(chunk)
        }
        socket.write(Buffer.alloc(4))
      }
    })
    socket.on("data", (chunk) => {
      receivedBytes += chunk.length
      if (receivedBytes > 16 * 1024) return socket.destroy(new Error("clamd_reply_too_large"))
      chunks.push(chunk)
    })
    socket.on("end", () => resolveReply(Buffer.concat(chunks).toString().replace(/\0/g, "").trim()))
    socket.on("error", reject)
    socket.on("close", () => clearTimeout(deadline))
  })
}

function readBody(req, limit, timeoutMs) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      req.resume()
      reject(error)
    }
    const deadline = setTimeout(() => fail(new RequestError(408, "body_timeout")), timeoutMs)
    req.on("data", (chunk) => {
      if (settled) return
      total += chunk.length
      if (total > limit) return fail(new RequestError(413, "too_large"))
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolveBody(Buffer.concat(chunks))
    })
    req.on("error", () => fail(new RequestError(400, "invalid_body")))
    req.on("aborted", () => fail(new RequestError(400, "invalid_body")))
  })
}

export function createScannerServer(options) {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(options.token ?? "")) throw new Error("CLAMAV_TOKEN must contain 32 to 512 URL-safe characters")
  const maxBytes = positiveInteger(options.maxBytes, MAX_FILE_BYTES, MAX_FILE_BYTES)
  const authorizationDigest = createHash("sha256").update(`Bearer ${options.token}`).digest()
  let scanning = false
  const createServer = options.http2 ? http2.createServer : http.createServer
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" }
      if (req.httpVersionMajor !== 2) headers.Connection = "close"
      res.writeHead(status, headers)
      res.end(JSON.stringify(body))
    }
    if (req.method === "GET" && req.url === "/health") {
      try {
        const ok = await callClamd(options, "PING", undefined, options.healthTimeoutMs)
        return send(ok === "PONG" ? 200 : 503, { ok: ok === "PONG" })
      } catch { return send(503, { ok: false }) }
    }
    if (options.healthOnly || req.method !== "POST" || req.url !== "/scan") return send(404, { error: "not_found" })
    const receivedDigest = createHash("sha256").update(req.headers.authorization ?? "").digest()
    if (!timingSafeEqual(authorizationDigest, receivedDigest)) return send(401, { error: "unauthorized" })
    if (scanning) return send(503, { error: "busy" })
    scanning = true
    try {
      const contentType = req.headers["content-type"] ?? ""
      if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new RequestError(400, "invalid_multipart")
      const bodyLimit = maxBytes + MULTIPART_OVERHEAD_BYTES
      const contentLength = Number(req.headers["content-length"])
      if (Number.isFinite(contentLength) && contentLength > bodyLimit) throw new RequestError(413, "too_large")
      const body = await readBody(req, bodyLimit, options.bodyTimeoutMs)
      let form
      try {
        form = await new Request("http://localhost/scan", { method: "POST", headers: { "Content-Type": contentType }, body }).formData()
      } catch { throw new RequestError(400, "invalid_multipart") }
      const entries = [...form.entries()]
      if (entries.length !== 1 || entries[0][0] !== "FILES" || typeof entries[0][1] === "string") throw new RequestError(400, "one_file_required")
      const file = entries[0][1]
      if (file.size > maxBytes) throw new RequestError(413, "too_large")
      const raw = await callClamd(options, "INSTREAM", Buffer.from(await file.arrayBuffer()), options.scanTimeoutMs)
      const found = /:\s(.+)\sFOUND$/.exec(raw)
      const result = found
        ? { Status: "FOUND", Description: found[1], FileName: file.name }
        : /\sOK$/.test(raw)
          ? { Status: "OK", Description: "", FileName: file.name }
          : { Status: "ERROR", Description: "clamd_error", FileName: file.name }
      return send(200, [result])
    } catch (error) {
      return send(error instanceof RequestError ? error.status : 503, { error: error instanceof RequestError ? error.message : "scan_unavailable" })
    } finally { scanning = false }
  })
  server.headersTimeout = 10_000
  server.requestTimeout = options.bodyTimeoutMs
  server.setTimeout(90_000)
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = scannerOptions()
  const server = createScannerServer(options)
  server.listen(positiveInteger(process.env.PORT, 8080, 65535), "0.0.0.0", () => console.log("[antsia-clamav-rest] HTTP ready; health requires clamd PONG"))
  if (options.http2) {
    const health = createScannerServer({ ...options, http2: false, healthOnly: true })
    health.listen(positiveInteger(process.env.HEALTH_PORT, 8081, 65535), "0.0.0.0")
  }
}
