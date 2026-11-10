/** PA5 — forme fermée des jobs et phrases de transport indépendantes des contenus sociaux. */
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { parseSource, readRepoFile, walk } from "./lib/source-files"

const JOB_FIELDS = new Set(["networkId", "recipientPersonId", "channel", "notificationId", "callId", "subscriptionId", "applicationId", "category", "dedupKey", "weekStart", "state", "attempts", "nextAttemptAt", "leaseUntil", "leaseToken", "providerReceiptId", "resultCode", "createdAt", "updatedAt", "nativeBindingId", "sessionGeneration", "nativeExpiresAt"])
function illegalJobFields(text: string): string[] {
  const source = parseSource("tables.ts", text), illegal: string[] = []
  walk(source, (node) => {
    if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name) || node.name.text !== "notificationDeliveryJobs" || !ts.isCallExpression(node.initializer)) return
    // Remonte les .index() pour retrouver l'appel defineTable().
    let expression: ts.Expression = node.initializer
    while (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) expression = expression.expression.expression
    if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== "defineTable") return
    const fields = expression.arguments[0]
    if (!fields || !ts.isObjectLiteralExpression(fields)) { illegal.push("opaqueFields"); return }
    for (const field of fields.properties) {
      if (!ts.isPropertyAssignment(field) || !(ts.isIdentifier(field.name) || ts.isStringLiteral(field.name))) { illegal.push("opaqueField"); continue }
      if (!JOB_FIELDS.has(field.name.text)) illegal.push(field.name.text)
    }
  })
  return illegal
}

function unsafeTransportCopy(text: string): string[] {
  const source = parseSource("transports.ts", text), findings: string[] = []
  walk(source, (node) => {
    if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name)) return
    if (node.name.text === "title" && !(ts.isIdentifier(node.initializer) && node.initializer.text === "BRAND_NAME")) findings.push("title")
    if (node.name.text === "body") {
      const neutral = ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "neutralNotificationMessage"
      const serialized = ts.isCallExpression(node.initializer) && ts.isPropertyAccessExpression(node.initializer.expression) && ts.isIdentifier(node.initializer.expression.expression) && node.initializer.expression.expression.text === "JSON" && node.initializer.expression.name.text === "stringify"
      const oauthForm = ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "URLSearchParams"
      if (!neutral && !serialized && !oauthForm) findings.push("body")
    }
  })
  return findings
}

describe("notification-payload-content", () => {
  it("détecte un contenu ou un contact ajouté à la file, y compris derrière un index", () => {
    expect(illegalJobFields('const tables = { notificationDeliveryJobs: defineTable({ networkId: v.id("networks"), body: v.string(), email: v.string() }).index("by_at", ["createdAt"]) }')).toEqual(["body", "email"])
  })
  it("aucun contenu ni contact dans les jobs réels", () => {
    expect(illegalJobFields(readRepoFile("convex/modules/notifications/tables.ts"))).toEqual([])
  })
  it("voit une copie de texte social dans un transport", () => {
    expect(unsafeTransportCopy("const payload = { title: post.title, body: message.text };")).toEqual(["title", "body"])
  })
  it("les titres/corps du transport ne viennent que de la marque et du compteur neutre", () => {
    expect(unsafeTransportCopy(readRepoFile("convex/modules/notifications/transports.ts"))).toEqual([])
    expect(readRepoFile("convex/modules/notifications/transports.ts")).toContain("isNeutralNotificationPayload(payload)")
    expect(readRepoFile("convex/modules/notifications/digest.ts")).toContain("neutralNotificationMessage(current.payload.locale, current.payload.count)")
  })
  it("le transport natif garde une enveloppe fermée sans identité, contenu ou jeton média", () => {
    const source = readRepoFile("convex/modules/notifications/transports.ts")
    expect(source).toContain("isNativeCallPushPayload")
    expect(source).toContain("voip")
    expect(illegalJobFields('const tables = { notificationDeliveryJobs: defineTable({ nativeBindingId: v.string(), sessionGeneration: v.string(), nativeExpiresAt: v.number(), callerName: v.string() }) }')).toEqual(["callerName"])
  })
})
