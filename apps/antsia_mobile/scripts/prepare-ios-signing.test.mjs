import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "vitest"
import { prepareIosSigning, renderIosGymfile, selectIosSigning } from "./prepare-ios-signing.mjs"

const expected = { iosTeamId: "TEAM123456", iosBundleIdentifier: "ga.antsia.mobile" }
const fingerprint = "A".repeat(40)
const profile = { uuid: "11111111-2222-4333-8444-555555555555", teamId: expected.iosTeamId, applicationId: `${expected.iosTeamId}.${expected.iosBundleIdentifier}`, expiresAt: "2030-01-01T00:00:00+00:00", certificateSha1s: [fingerprint] }
const keychain = { path: "/tmp/eas-build-fixture.keychain", fingerprints: [fingerprint] }
const now = Date.parse("2026-10-21T00:00:00Z")

test("Simulator, internal, Android, cloud and non-macOS invocations perform no signing work", () => {
  const store = { NATIVE_IOS_APP_STORE_BUILD: "true" }
  assert.equal(prepareIosSigning({ ...store, EAS_BUILD_PLATFORM: "ios", EAS_LOCAL_BUILD_WORKINGDIR: "/unused", NATIVE_IOS_SIMULATOR_BUILD: "true" }, "darwin"), null)
  assert.equal(prepareIosSigning({ EAS_BUILD_PLATFORM: "ios", EAS_LOCAL_BUILD_WORKINGDIR: "/unused" }, "darwin"), null)
  assert.equal(prepareIosSigning({ ...store, EAS_BUILD_PLATFORM: "android", EAS_LOCAL_BUILD_WORKINGDIR: "/unused" }, "darwin"), null)
  assert.equal(prepareIosSigning({ ...store, EAS_BUILD_PLATFORM: "ios" }, "darwin"), null)
  assert.equal(prepareIosSigning({ ...store, EAS_BUILD_PLATFORM: "ios", EAS_LOCAL_BUILD_WORKINGDIR: "/unused" }, "linux"), null)
})

test("only the store profile opts into the App Store signing override", () => {
  const { build } = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"))
  assert.equal(build.testflight.distribution, "store")
  assert.equal(build.testflight.env.NATIVE_IOS_APP_STORE_BUILD, "true")
  assert.equal(build.telephone.distribution, "internal")
  assert.equal(build.telephone.env.NATIVE_IOS_APP_STORE_BUILD, undefined)
  assert.equal(build.simulateur.extends, "telephone")
  assert.equal(build.simulateur.env.NATIVE_IOS_APP_STORE_BUILD, undefined)
  assert.equal(build.simulateur.env.NATIVE_IOS_SIMULATOR_BUILD, "true")
})

test("selects the profile certificate rather than another valid homonymous identity", () => {
  const selected = selectIosSigning([profile, { ...profile, applicationId: "TEAM123456.other.product" }], [{ ...keychain, fingerprints: ["B".repeat(40), fingerprint] }], expected, now)
  assert.equal(selected.fingerprint, fingerprint)
  assert.equal(selected.profile.uuid, profile.uuid)
})

test("rejects missing, expired and ambiguous profiles and identities", () => {
  assert.throws(() => selectIosSigning([], [keychain], expected, now), /missing/)
  assert.throws(() => selectIosSigning([{ ...profile, expiresAt: new Date(now).toISOString() }], [keychain], expected, now), /expired/)
  assert.throws(() => selectIosSigning([profile, { ...profile, uuid: "99999999-2222-4333-8444-555555555555" }], [keychain], expected, now), /Ambiguous/)
  assert.throws(() => selectIosSigning([profile], [], expected, now), /absent/)
  assert.throws(() => selectIosSigning([profile], [keychain, { ...keychain, path: "/tmp/eas-build-other.keychain" }], expected, now), /Ambiguous/)
})

test("pins archive and export to the same fingerprint and keychain with two jobs", () => {
  const gym = renderIosGymfile({ profile, fingerprint, keychainPath: keychain.path }, "/cache/ios/logs")
  assert.ok(gym.includes(`codesigning_identity('${fingerprint}')`))
  assert.ok(gym.includes(`-jobs 2 CODE_SIGN_IDENTITY=${fingerprint}`))
  assert.equal(gym.match(/--keychain \/tmp\/eas-build-fixture.keychain/g)?.length, 2)
  assert.ok(gym.includes(`signingCertificate: '${fingerprint}'`))
  assert.ok(gym.includes(`'ga.antsia.mobile' => '${profile.uuid}'`))
  assert.ok(gym.includes("method: 'app-store'"))
})
