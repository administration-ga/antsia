// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { smsConfig, verifiedBirdEvent } from "./smsBird"
import { exportableRecord } from "../people/dataInventory"

const phone = "+33123456789"
const relay = "+33111222333"
const secret = "whsec_" + btoa("test-key-32-bytes-for-unit-tests")
const pub = api.modules.diaspora.sms
const priv = internal.modules.diaspora.sms
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function configure() {
  vi.stubEnv("DIASPORA_SMS_ENABLED", "true")
  vi.stubEnv("DIASPORA_SMS_BIRD_KEY", "bk_eu1_test")
  vi.stubEnv("DIASPORA_SMS_BIRD_ORIGIN", "https://eu1.platform.bird.com")
  vi.stubEnv("DIASPORA_SMS_RELAY", relay)
  vi.stubEnv("DIASPORA_SMS_WORKSPACE", "ws_test")
  vi.stubEnv("DIASPORA_SMS_WEBHOOK_SECRET", secret)
}

async function fixture() {
  configure()
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function account(subject: string) {
    const client = t.withIdentity({ subject })
    const personId = await client.mutation(api.modules.people.persons.ensureMyPerson, {})
    await t.run(async (ctx) => {
      for (const networkId of [root, network]) {
        const current = await ctx.db
          .query("networkMemberships")
          .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
          .unique()
        if (current) await ctx.db.patch(current._id, { status: "declaree" })
        else
          await ctx.db.insert("networkMemberships", {
            networkId,
            personId,
            status: "declaree",
            role: "member",
            joinedAt: Date.now(),
            statusChangedAt: Date.now(),
          })
      }
    })
    return { client, personId }
  }
  const one = await account("sms-one")
  const two = await account("sms-two")
  function inbound(text: string, id: string, at = Date.now()) {
    const raw = JSON.stringify({
      type: "sms.received",
      timestamp: new Date(at).toISOString(),
      data: { text, from: phone, to: relay, workspace_id: "ws_test", sms_id: id },
    })
    return t.mutation(priv.applyEvent, { deliveryId: id, raw })
  }
  return { t, one, two, inbound, network, root }
}

describe("consentement SMS iCom", () => {
  it("n’active l’envoi que sur l’origine HTTPS de la région de la clé opérateur", () => {
    configure()
    expect(smsConfig()?.endpoint).toBe("https://eu1.platform.bird.com/v1/sms/messages")
    for (const origin of ["", "https://us1.platform.bird.com", "https://other.example", "http://eu1.platform.bird.com"]) {
      vi.stubEnv("DIASPORA_SMS_BIRD_ORIGIN", origin)
      expect(smsConfig()).toBeNull()
    }
  })

  it("associe un seul membre, refuse les autres, réconcilie les accusés et révoque par STOP", async () => {
    vi.useFakeTimers()
    const { t, one, two, inbound } = await fixture()
    const first = await one.client.mutation(pub.createPairing, { label: "Mon contact" })
    const second = await two.client.mutation(pub.createPairing, { label: "Autre" })
    await inbound("JOIN " + first.code, "in-first")
    await inbound("JOIN " + second.code, "in-second")
    const inbox = await one.client.query(pub.inbox, {})
    expect(inbox.threads).toHaveLength(1)
    expect(inbox.personId).toBe(one.personId)
    expect(JSON.stringify(inbox)).not.toContain(phone)
    expect(await two.client.query(pub.inbox, {})).toMatchObject({ threads: [] })
    const threadId = inbox.threads[0]!.id
    await expect(
      two.client.query(pub.history, { threadId, paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow()
    const body = "Rendez-vous demain."
    await inbound(body, "in-reply")
    await inbound(body, "in-reply")
    const requestId = crypto.randomUUID()
    const id = await one.client.mutation(pub.send, { threadId, body: "D’accord.", requestId })
    expect(await one.client.mutation(pub.send, { threadId, body: "D’accord.", requestId })).toBe(id)
    const send = vi.fn<(endpoint: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(JSON.stringify({ id: "sms_out" }), { status: 202 }))
    vi.stubGlobal("fetch", send)
    await t.action(priv.dispatch, { id, attempt: 0 })
    expect(send).toHaveBeenCalledOnce()
    const [endpoint, init] = send.mock.calls[0]!
    expect(endpoint).toBe("https://eu1.platform.bird.com/v1/sms/messages")
    expect(init.headers).toMatchObject({ "Idempotency-Key": "icom-" + id })
    expect(JSON.parse(String(init.body))).toMatchObject({ to: phone, from: relay, metadata: { icom_id: id } })
    for (const [type, at] of [
      ["sms.delivered", Date.now()],
      ["sms.accepted", Date.now()],
      ["sms.sent", Date.now() - 1000],
    ] as const) {
      await t.mutation(priv.applyEvent, {
        deliveryId: type,
        raw: JSON.stringify({
          type,
          timestamp: new Date(at).toISOString(),
          data: { sms_id: "sms_out", from: relay, to: phone, workspace_id: "ws_test" },
        }),
      })
    }
    const page = await one.client.query(pub.history, { threadId, paginationOpts: { numItems: 10, cursor: null } })
    expect(page.page).toHaveLength(2)
    expect(page.page.find((m) => m.id === id)?.status).toBe("delivered")
    expect(JSON.stringify(page)).not.toContain(phone)
    expect(exportableRecord("diasporaSmsRoutes", { _id: "private", _creationTime: Date.now(), phone }, one.personId)).toBeNull()
    vi.stubEnv("DIASPORA_SMS_ENABLED", "false")
    await inbound("STOP", "in-stop")
    expect((await one.client.query(pub.inbox, {})).threads[0]?.active).toBe(false)
    vi.stubEnv("DIASPORA_SMS_ENABLED", "true")
    await expect(
      one.client.mutation(pub.send, { threadId, body: "Après STOP", requestId: crypto.randomUUID() }),
    ).rejects.toThrow()
  })

  it("vérifie à nouveau l’activation du relais entre l’enregistrement et l’envoi", async () => {
    vi.useFakeTimers()
    const { t, one, two, inbound } = await fixture()
    const first = await one.client.mutation(pub.createPairing, { label: "Contact" })
    await inbound("JOIN " + first.code, "in-pair")
    const threadId = (await one.client.query(pub.inbox, {})).threads[0]!.id
    const args = { threadId, body: "Bonjour", requestId: crypto.randomUUID() }
    await expect(two.client.mutation(pub.send, args)).rejects.toThrow()
    const id = await one.client.mutation(pub.send, args)
    await expect(one.client.mutation(pub.send, { ...args, body: "Autre" })).rejects.toThrow()
    vi.stubEnv("DIASPORA_SMS_ENABLED", "false")
    const transport = vi.fn()
    vi.stubGlobal("fetch", transport)
    await t.action(priv.dispatch, { id, attempt: 0 })
    expect(transport).not.toHaveBeenCalled()
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: "failed" })
    expect(await one.client.query(pub.available, {})).toBe(false)
    await expect(one.client.mutation(pub.createPairing, { label: "Autre" })).rejects.toThrow()
  })

  it("suspend les échanges en attente et honore STOP même pendant la fermeture du réseau", async () => {
    vi.useFakeTimers()
    const { t, one, network, root, inbound } = await fixture()
    const pairing = await one.client.mutation(pub.createPairing, { label: "Contact" })
    await inbound("JOIN " + pairing.code, "in-pair")
    const threadId = (await one.client.query(pub.inbox, {})).threads[0]!.id
    const id = await one.client.mutation(pub.send, { threadId, body: "En attente", requestId: crypto.randomUUID() })
    const now = Date.now()
    await t.run(ctx => ctx.db.insert("judicialMeasures", {
      networkId: root, kind: "suspend_access", target: { kind: "network", id: root },
      targetKind: "network", targetId: root, orderReference: "TEST",
      status: "active", startsAt: now - 1000, endsAt: now + 60_000, executedAt: now, createdByPersonId: one.personId,
      effects: { membershipSuspended: false, pageDeactivated: false, contentRemoved: false }, createdAt: now, updatedAt: now,
    }))
    await inbound("Pendant la fermeture", "in-suspended")
    expect(await t.query(priv.forDispatch, { id })).toBeNull()
    expect(await t.run(ctx => ctx.db.query("diasporaSmsMessages").collect())).toHaveLength(1)
    await t.run(ctx => ctx.db.patch(network, { status: "archived" }))
    await inbound("STOP", "in-stop")
    expect(await t.run(ctx => ctx.db.get(threadId))).toMatchObject({ active: false })
  })

  it("ouvre le fil une seule fois via le webhook signé et rejette les remises altérées ou expirées", async () => {
    vi.useFakeTimers()
    const { t, one } = await fixture()
    const pairing = await one.client.mutation(pub.createPairing, { label: "Été" })
    const now = Date.now()
    const ts = String(Math.floor(now / 1000))
    const data = JSON.stringify({
      type: "sms.received", timestamp: new Date(now).toISOString(),
      data: { from: phone, to: relay, workspace_id: "ws_test", sms_id: "in-été", text: "JOIN " + pairing.code },
    })
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(atob(secret.slice(6))),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("evt_42." + ts + "." + data)))
    const headers = new Headers({
      "webhook-id": "evt_42",
      "webhook-timestamp": ts,
      "webhook-signature": "v1," + btoa(String.fromCharCode(...sig)),
    })
    expect(await verifiedBirdEvent(headers, enc.encode(data), secret, now)).toBe("evt_42")
    expect(await verifiedBirdEvent(headers, enc.encode(data + " "), secret, now)).toBeNull()
    expect(await verifiedBirdEvent(headers, enc.encode(data), secret, now + 301000)).toBeNull()
    const path = "/webhooks/diaspora/sms"
    expect((await t.fetch(path, { method: "POST", headers, body: data + " " })).status).toBe(401)
    expect((await one.client.query(pub.inbox, {})).threads).toHaveLength(0)
    for (let i = 0; i < 2; i++) {
      expect((await t.fetch(path, { method: "POST", headers, body: data })).status).toBe(204)
    }
    expect((await one.client.query(pub.inbox, {})).threads).toMatchObject([{ active: true, label: "Été" }])
  })
})
