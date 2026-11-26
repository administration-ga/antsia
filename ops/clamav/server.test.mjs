/** Façade réelle HTTP/TCP, daemon INSTREAM synthétique : aucun moteur ni fournisseur externe. */
import assert from "node:assert/strict"
import { once } from "node:events"
import http from "node:http"
import http2 from "node:http2"
import net from "node:net"
import { test } from "node:test"

import { createScanQueue, createScannerServer, MAX_FILE_BYTES, scannerOptions } from "./server.mjs"

const TEST_TOKEN = "synthetic_test_token_32_characters_only"

async function fixture(t, { scanReply = "stream: OK\0", healthReply = "PONG\0", hold = false, useHttp2 = false, queueDepth, queueWaitMs } = {}) {
  const scanned = []
  const pending = []
  const sockets = new Set()
  let pingCount = 0
  // Analyses INSTREAM ouvertes en même temps dans le daemon : la façade n'en confie qu'une à la fois.
  let inFlight = 0
  let maxInFlight = 0
  const scanWaiters = []
  let notifyScan
  const scanStarted = new Promise((resolveScan) => { notifyScan = resolveScan })
  const daemon = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    let body = Buffer.alloc(0)
    let handled = false
    socket.on("data", (chunk) => {
      body = Buffer.concat([body, chunk])
      if (handled) return
      if (body.subarray(0, 6).equals(Buffer.from("zPING\0"))) {
        handled = true
        pingCount++
        return socket.end(healthReply)
      }
      const prefix = Buffer.from("zINSTREAM\0")
      if (body.length < prefix.length || !body.subarray(0, prefix.length).equals(prefix)) return
      let offset = prefix.length
      const pieces = []
      while (body.length >= offset + 4) {
        const size = body.readUInt32BE(offset)
        offset += 4
        if (size === 0) {
          handled = true
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          socket.on("close", () => { inFlight-- })
          scanned.push(Buffer.concat(pieces))
          notifyScan()
          for (const waiter of scanWaiters.splice(0)) waiter()
          if (hold) pending.push(socket)
          else socket.end(scanReply)
          return
        }
        if (body.length < offset + size) return
        pieces.push(body.subarray(offset, offset + size))
        offset += size
      }
    })
  })
  daemon.listen(0, "127.0.0.1")
  await once(daemon, "listening")
  const options = { ...scannerOptions({ CLAMAV_TOKEN: TEST_TOKEN }), http2: useHttp2, clamdPort: daemon.address().port, maxBytes: 64, scanTimeoutMs: 500, healthTimeoutMs: 100, bodyTimeoutMs: 1000, ...(queueDepth === undefined ? {} : { queueDepth }), ...(queueWaitMs === undefined ? {} : { queueWaitMs }) }
  const server = createScannerServer(options)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const health = useHttp2 ? createScannerServer({ ...options, http2: false, healthOnly: true }) : null
  if (health) {
    health.listen(0, "127.0.0.1")
    await once(health, "listening")
  }
  const sessions = new Set()
  if (useHttp2) server.on("session", (session) => {
    sessions.add(session)
    session.on("close", () => sessions.delete(session))
  })
  t.after(async () => {
    server.closeAllConnections?.()
    health?.closeAllConnections()
    for (const session of sessions) session.destroy()
    for (const socket of sockets) socket.destroy()
    await Promise.all([new Promise((resolveClose) => server.close(resolveClose)), new Promise((resolveClose) => daemon.close(resolveClose)), health ? new Promise((resolveClose) => health.close(resolveClose)) : Promise.resolve()])
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    healthUrl: health ? `http://127.0.0.1:${health.address().port}` : null,
    scanned,
    scanStarted,
    pingCount: () => pingCount,
    maxInFlight: () => maxInFlight,
    /** Rend la main quand le daemon a reçu `count` fichiers au total. */
    scansReceived: (count) => new Promise((resolveCount) => {
      const check = () => (scanned.length >= count ? resolveCount() : scanWaiters.push(check))
      check()
    }),
    release: () => { for (const socket of pending.splice(0)) socket.end(scanReply) },
    /** Termine l'analyse la plus ancienne encore retenue par le daemon. */
    releaseNext: () => pending.shift()?.end(scanReply),
  }
}

function multipart(bytes = Buffer.from("synthetic clean bytes"), name = "FILES") {
  const form = new FormData()
  form.append(name, new Blob([bytes]), "synthetic.bin")
  return form
}

function scan(url, body, token = TEST_TOKEN) {
  return fetch(`${url}/scan`, { method: "POST", headers: token === null ? {} : { Authorization: `Bearer ${token}` }, body })
}

async function h2Request(url, { path = "/scan", body, token = TEST_TOKEN } = {}) {
  const session = http2.connect(url)
  try {
    const encoded = body ? new Request("http://localhost/scan", { method: "POST", body }) : null
    const headers = { ":method": body ? "POST" : "GET", ":path": path }
    if (token !== null) headers.authorization = `Bearer ${token}`
    if (encoded) headers["content-type"] = encoded.headers.get("content-type")
    const payload = encoded ? Buffer.from(await encoded.arrayBuffer()) : undefined
    return await new Promise((resolveResponse, reject) => {
      const request = session.request(headers)
      const chunks = []
      let status
      request.on("response", (responseHeaders) => { status = responseHeaders[":status"] })
      request.on("data", (chunk) => chunks.push(chunk))
      request.on("end", () => resolveResponse({ status, body: JSON.parse(Buffer.concat(chunks).toString()) }))
      request.on("error", reject)
      session.on("error", reject)
      request.end(payload)
    })
  } finally { session.destroy() }
}

test("le démarrage est fermé sans jeton et la borne ne dépasse jamais 60 MiB", () => {
  for (const token of ["", "too-short", `${TEST_TOKEN}\n`]) assert.throws(() => createScannerServer({ ...scannerOptions({}), token }), /CLAMAV_TOKEN/)
  assert.equal(scannerOptions({}).maxBytes, 60 * 1024 * 1024)
  assert.throws(() => scannerOptions({ MAX_BYTES: String(MAX_FILE_BYTES + 1) }), /Invalid scanner limit/)
})

test("sans Bearer valide, aucun octet n'est transmis au daemon", async (t) => {
  const f = await fixture(t)
  for (const token of [null, "incorrect", "x".repeat(TEST_TOKEN.length)]) {
    const response = await scan(f.url, multipart(), token)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: "unauthorized" })
  }
  assert.equal(f.scanned.length, 0)
  assert.equal(f.pingCount(), 0)
})

test("la santé publique ne rend que la disponibilité réelle du PING", async (t) => {
  const healthy = await fixture(t)
  const response = await fetch(`${healthy.url}/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  const unavailable = await fixture(t, { healthReply: "NOT_PONG\0" })
  const failed = await fetch(`${unavailable.url}/health`)
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { ok: false })
})

test("un fichier autorisé garde ses octets binaires et le dialecte attendu par ANTSIA", async (t) => {
  const f = await fixture(t)
  const bytes = Buffer.from([0, 255, 13, 10, 45, 45, 42, 0])
  const response = await scan(f.url, multipart(bytes))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [{ Status: "OK", Description: "", FileName: "synthetic.bin" }])
  assert.deepEqual(f.scanned, [bytes])
})

test("les réponses infectée et indéterminée ne deviennent jamais saines", async (t) => {
  const infected = await fixture(t, { scanReply: "stream: Synthetic.Test FOUND\0" })
  assert.deepEqual(await (await scan(infected.url, multipart())).json(), [{ Status: "FOUND", Description: "Synthetic.Test", FileName: "synthetic.bin" }])
  const failed = await fixture(t, { scanReply: "stream: scanner failed ERROR\0" })
  assert.deepEqual(await (await scan(failed.url, multipart())).json(), [{ Status: "ERROR", Description: "clamd_error", FileName: "synthetic.bin" }])
})

test("un fichier trop grand et un multipart invalide sont refusés avant scan", async (t) => {
  const f = await fixture(t)
  const tooLarge = await scan(f.url, multipart(Buffer.alloc(65)))
  assert.equal(tooLarge.status, 413)
  assert.deepEqual(await tooLarge.json(), { error: "too_large" })
  assert.equal((await scan(f.url, multipart(Buffer.from("synthetic"), "OTHER"))).status, 400)
  const invalid = await fetch(`${f.url}/scan`, { method: "POST", headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "multipart/form-data; boundary=missing" }, body: "invalid" })
  assert.equal(invalid.status, 400)
  assert.equal(f.scanned.length, 0)
})

test("un corps chunked au-delà de la borne reçoit 413 sans rupture opaque", async (t) => {
  const f = await fixture(t)
  const response = await new Promise((resolveResponse, reject) => {
    const request = http.request(`${f.url}/scan`, { method: "POST", headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "multipart/form-data; boundary=synthetic", "Transfer-Encoding": "chunked" } }, (result) => {
      const chunks = []
      result.on("data", (chunk) => chunks.push(chunk))
      result.on("end", () => resolveResponse({ status: result.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }))
    })
    request.on("error", reject)
    request.end(Buffer.alloc(1024 * 1024 + 65))
  })
  assert.deepEqual(response, { status: 413, body: { error: "too_large" } })
  assert.equal(f.scanned.length, 0)
})

test("la file d'attente : défauts bornés, profondeur et attente refusées hors contrat", () => {
  const defaults = scannerOptions({})
  assert.equal(defaults.queueDepth, 8)
  assert.equal(defaults.queueWaitMs, 30_000)
  assert.equal(scannerOptions({ QUEUE_DEPTH: "32", QUEUE_WAIT_MS: "40000" }).queueDepth, 32)
  for (const env of [{ QUEUE_DEPTH: "0" }, { QUEUE_DEPTH: "33" }, { QUEUE_WAIT_MS: "40001" }, { QUEUE_WAIT_MS: "-1" }]) assert.throws(() => scannerOptions(env), /Invalid scanner limit/)
})

test("la file rend le tour de clamd dans l'ordre d'arrivée, un seul à la fois", async () => {
  const queue = createScanQueue({ depth: 3 })
  const order = []
  const tickets = [queue.admit(), queue.admit(), queue.admit(), queue.admit()]
  assert.throws(() => queue.admit(), (error) => error.status === 503 && error.message === "queue_full")
  const turns = tickets.map((ticket, index) => ticket.turn(1000).then(() => order.push(index)))
  await turns[0]
  await new Promise((resolveTick) => setImmediate(resolveTick))
  assert.deepEqual(order, [0])
  for (const index of [0, 1, 2]) {
    tickets[index].leave()
    await turns[index + 1]
  }
  assert.deepEqual(order, [0, 1, 2, 3])
  tickets[3].leave()
  tickets[3].leave()
  assert.equal(queue.admitted(), 0)
  // La place rendue se reprend : la file n'a rien perdu en route.
  const again = queue.admit()
  await again.turn(1000)
  again.leave()
})

test("une attente trop longue ou un client parti rend sa place sans jamais obtenir clamd", async () => {
  const queue = createScanQueue({ depth: 2 })
  const holder = queue.admit()
  await holder.turn(1000)
  const late = queue.admit()
  await assert.rejects(late.turn(20), (error) => error.status === 503 && error.message === "queue_timeout")
  late.leave()
  const gone = queue.admit()
  const pendingTurn = gone.turn(1000)
  gone.leave()
  await assert.rejects(pendingTurn, (error) => error.status === 503)
  const next = queue.admit()
  const nextTurn = next.turn(1000)
  holder.leave()
  await nextTurn
  next.leave()
  assert.equal(queue.admitted(), 0)
})

test("quatre analyses simultanées attendent leur tour et finissent toutes saines, une seule à la fois dans clamd", async (t) => {
  const f = await fixture(t, { hold: true })
  const bodies = [0, 1, 2, 3].map((index) => Buffer.from(`synthetic file ${index}`))
  const requests = bodies.map((bytes) => scan(f.url, multipart(bytes)))
  for (let received = 1; received <= bodies.length; received++) {
    await f.scansReceived(received)
    // Le daemon ne voit jamais deux fichiers à la fois : le suivant attend la fin du précédent.
    await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    assert.equal(f.scanned.length, received)
    f.releaseNext()
  }
  const responses = await Promise.all(requests)
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [{ Status: "OK", Description: "", FileName: "synthetic.bin" }])
  }
  assert.equal(f.maxInFlight(), 1)
  assert.deepEqual([...f.scanned].sort(Buffer.compare), [...bodies].sort(Buffer.compare))
})

test("une file pleine répond 503 queue_full sans transmettre le fichier au daemon", async (t) => {
  const f = await fixture(t, { hold: true, queueDepth: 1 })
  const first = scan(f.url, multipart(Buffer.from("first")))
  await f.scanStarted
  const second = scan(f.url, multipart(Buffer.from("second")))
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
  const full = await scan(f.url, multipart(Buffer.from("third")))
  assert.equal(full.status, 503)
  assert.deepEqual(await full.json(), { error: "queue_full" })
  f.releaseNext()
  await f.scansReceived(2)
  f.releaseNext()
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
  assert.deepEqual(f.scanned.map(String), ["first", "second"])
})

test("l'attente en file est bornée et un timeout de clamd reste une indisponibilité", async (t) => {
  const f = await fixture(t, { hold: true, queueWaitMs: 50 })
  const first = scan(f.url, multipart())
  await f.scanStarted
  const waited = await scan(f.url, multipart())
  assert.equal(waited.status, 503)
  assert.deepEqual(await waited.json(), { error: "queue_timeout" })
  assert.equal(f.scanned.length, 1)
  f.release()
  assert.equal((await first).status, 200)
  const timeout = await fixture(t, { hold: true })
  const failed = await scan(timeout.url, multipart())
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { error: "scan_unavailable" })
})

test("un client parti pendant l'attente libère sa place : son fichier n'est jamais analysé", async (t) => {
  const f = await fixture(t, { hold: true, queueDepth: 1 })
  const first = scan(f.url, multipart(Buffer.from("first")))
  await f.scanStarted
  const controller = new AbortController()
  const abandoned = fetch(`${f.url}/scan`, { method: "POST", headers: { Authorization: `Bearer ${TEST_TOKEN}` }, body: multipart(Buffer.from("abandoned")), signal: controller.signal })
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
  controller.abort()
  await assert.rejects(abandoned)
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
  // La place rendue accueille un nouvel appel, même avec une file d'une seule place.
  const next = scan(f.url, multipart(Buffer.from("next")))
  await new Promise((resolveTick) => setTimeout(resolveTick, 20))
  f.releaseNext()
  await f.scansReceived(2)
  f.releaseNext()
  assert.equal((await first).status, 200)
  assert.equal((await next).status, 200)
  assert.deepEqual(f.scanned.map(String), ["first", "next"])
})

test("h2c conserve authentification, binaire et limites avec une sonde HTTP/1 distincte", async (t) => {
  const f = await fixture(t, { useHttp2: true })
  assert.equal(scannerOptions({ HTTP2: "true" }).http2, true)
  assert.deepEqual(await h2Request(f.url, { path: "/health", token: null }), { status: 200, body: { ok: true } })
  assert.deepEqual(await h2Request(f.url, { body: multipart(), token: null }), { status: 401, body: { error: "unauthorized" } })
  const bytes = Buffer.from([255, 0, 10, 13, 42])
  assert.deepEqual(await h2Request(f.url, { body: multipart(bytes) }), { status: 200, body: [{ Status: "OK", Description: "", FileName: "synthetic.bin" }] })
  assert.deepEqual(f.scanned, [bytes])
  assert.deepEqual(await h2Request(f.url, { body: multipart(Buffer.alloc(65)) }), { status: 413, body: { error: "too_large" } })
  const health = await fetch(`${f.healthUrl}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true })
  assert.equal((await scan(f.healthUrl, multipart())).status, 404)
})
