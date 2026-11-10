import Foundation
import UIKit
import CallKit
import PushKit
import AVFoundation
import CoreFoundation

final class AntsiaCallCoordinator: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
  static let shared = AntsiaCallCoordinator()
  static var enabled: Bool { Bundle.main.object(forInfoDictionaryKey: "AntsiaNativeCallsEnabled") as? Bool == true }
  private let defaults = UserDefaults.standard
  private let bindingKey = "antsia.calls.binding.v1"
  private let queueKey = "antsia.calls.events.v1"
  private let seenKey = "antsia.calls.seen.v1"
  private var provider: CXProvider?
  private var registry: PKPushRegistry?
  private let controller = CXCallController()
  private var binding: [String: Any]?
  private var call: UUID?
  private var deadline: Double = 0
  private var isConnected = false
  private var pendingAnswer: CXAnswerCallAction?
  private var pendingStart: CXStartCallAction?
  private var pending: [String: CXAction] = [:]
  private var expiry: DispatchWorkItem?
  private var leaseExpiry: DispatchWorkItem?
  private var tokenValues: [String: String] = [:] // Mémoire seulement, jamais dans la file durable.
  private var voipTokenInvalidated = false
  var signal: (() -> Void)?
  private(set) var epoch = 0
  private var now: Double { Date().timeIntervalSince1970 * 1000 }
  private func error() -> NSError { NSError(domain: "AntsiaCallSystem", code: 1, userInfo: [NSLocalizedDescriptionKey: "nativeCallUnavailable"]) }
  private func validUUID(_ value: Any?) -> UUID? {
    guard let text = value as? String, text.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: .caseInsensitive.union(.regularExpression)) != nil else { return nil }
    return UUID(uuidString: text)
  }
  func start() {
    guard Self.enabled, provider == nil else { return }
    let configuration = CXProviderConfiguration(localizedName: "ANTSIA")
    configuration.supportedHandleTypes = [.generic]
    configuration.supportsVideo = true
    configuration.maximumCallGroups = 1
    configuration.maximumCallsPerCallGroup = 1
    configuration.includesCallsInRecents = false
    provider = CXProvider(configuration: configuration)
    provider?.setDelegate(self, queue: .main)
    binding = defaults.dictionary(forKey: bindingKey)
    if !liveBinding() { binding = nil; defaults.removeObject(forKey: bindingKey); defaults.removeObject(forKey: queueKey) }
    armLease()
    let pushRegistry = PKPushRegistry(queue: .main)
    pushRegistry.delegate = self
    pushRegistry.desiredPushTypes = [.voIP]
    registry = pushRegistry
  }
  private func liveBinding() -> Bool {
    Self.enabled && (binding?["expiresAt"] as? Double ?? 0) > now
  }
  func configure(_ value: [String: Any]) throws {
    guard Self.enabled, Set(value.keys) == ["applicationId", "deviceId", "bindingId", "expiresAt"],
      let application = value["applicationId"] as? String, application.range(of: "^[a-z][a-z0-9_-]{1,63}$", options: .regularExpression) != nil,
      let device = value["deviceId"] as? String, (8...128).contains(device.count),
      validUUID(value["bindingId"]) != nil, let until = value["expiresAt"] as? Double, until.isFinite, until.rounded() == until, until <= 9_007_199_254_740_991, until > now else { throw error() }
    start()
    if ["bindingId", "applicationId", "deviceId"].contains(where: { binding?[$0] as? String != value[$0] as? String }) { clear() }
    binding = value
    defaults.set(value, forKey: bindingKey)
    armLease()
    registry?.desiredPushTypes = [.voIP]
  }
  func tokens() -> [[String: String]] {
    guard liveBinding() else { return [] }
    if !voipTokenInvalidated, let data = registry?.pushToken(for: .voIP) { tokenValues["apns_voip"] = data.map { String(format: "%02x", $0) }.joined() }
    return tokenValues.map { ["provider": $0.key, "token": $0.value] }
  }
  func token(_ provider: String, _ data: Data) {
    guard Self.enabled else { return }
    if provider == "apns_voip" { voipTokenInvalidated = false }
    tokenValues[provider] = data.map { String(format: "%02x", $0) }.joined()
    emit("token", extra: ["provider": provider])
  }
  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) { token("apns_voip", pushCredentials.token) }
  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) { voipTokenInvalidated = true; tokenValues.removeValue(forKey: "apns_voip"); emit("token", extra: ["provider": "apns_voip"]) }

  private func admitted(_ raw: [String: Any]) -> Bool {
    guard liveBinding(), Set(raw.keys) == ["version", "kind", "phase", "networkId", "reference", "applicationId", "bindingId", "uuid", "expiresAt"],
      let version = raw["version"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 1,
      raw["kind"] as? String == "antsia.call", raw["phase"] as? String == "ring",
      raw["applicationId"] as? String == binding?["applicationId"] as? String,
      raw["bindingId"] as? String == binding?["bindingId"] as? String,
      validUUID(raw["uuid"]) != nil, validUUID(raw["bindingId"]) != nil,
      let until = raw["expiresAt"] as? Double, until.isFinite, until.rounded() == until, until > now, until <= now + 45_000,
      until <= (binding?["expiresAt"] as? Double ?? 0) else { return false }
    return ["networkId", "reference"].allSatisfy { key in
      guard let text = raw[key] as? String else { return false }
      return text.range(of: "^[a-z0-9]{16,64}$", options: .regularExpression) != nil
    }
  }
  func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    // VoIP n'est utilisé QUE pour l'ouverture. Même un push invalide est signalé
    // nativement, puis fermé : aucun appel JS/HTTP avant reportNewIncomingCall.
    start()
    var raw = payload.dictionaryPayload.reduce(into: [String: Any]()) { result, pair in if let key = pair.key as? String { result[key] = pair.value } }
    raw.removeValue(forKey: "aps")
    let accepted = admitted(raw)
    let uuid = validUUID(raw["uuid"]) ?? UUID()
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "ANTSIA")
    update.localizedCallerName = "ANTSIA"
    update.supportsHolding = true
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    let bindingEpoch = epoch
    provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] reportError in
      defer { completion() }
      guard let self else { return }
      guard reportError == nil else { return }
      let seen = self.seen()
      guard accepted, bindingEpoch == self.epoch, self.admitted(raw), self.call == nil, seen[uuid.uuidString] == nil else {
        self.provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed); return
      }
      self.call = uuid; self.isConnected = false
      self.deadline = raw["expiresAt"] as? Double ?? self.now
      var nextSeen = seen; nextSeen[uuid.uuidString] = self.deadline + 60_000
      nextSeen = Dictionary(uniqueKeysWithValues: nextSeen.sorted { $0.value > $1.value }.prefix(32).map { ($0.key, $0.value) })
      self.defaults.set(nextSeen, forKey: self.seenKey)
      self.emit("incoming", uuid: uuid, extra: ["payload": raw])
      self.armExpiry(uuid)
    }
    // Le provider existe même après clear() ; aucun completion conditionné à JS.
    if provider == nil { completion() }
  }
  private func seen() -> [String: Double] {
    let values = defaults.dictionary(forKey: seenKey) as? [String: Double] ?? [:]
    return Dictionary(uniqueKeysWithValues: values.filter { $0.value > now }.sorted { $0.value > $1.value }.prefix(32).map { ($0.key, $0.value) })
  }
  private func emit(_ kind: String, uuid: UUID? = nil, extra: [String: Any] = [:]) {
    guard liveBinding() else { return }
    var event = extra
    event["eventId"] = event["eventId"] ?? UUID().uuidString.lowercased(); event["kind"] = kind
    if let uuid { event["uuid"] = uuid.uuidString.lowercased() }
    var queue = (defaults.array(forKey: queueKey) as? [[String: Any]] ?? []).filter { ($0["until"] as? Double ?? 0) > now && $0["bindingId"] as? String == binding?["bindingId"] as? String }
    if queue.count >= 32 { queue.removeFirst(queue.count - 31) }
    queue.append(["event": event, "until": min(now + 60_000, binding?["expiresAt"] as? Double ?? now), "bindingId": binding?["bindingId"] as? String ?? ""])
    defaults.set(queue, forKey: queueKey)
    signal?()
  }
  func drain() -> [[String: Any]] {
    let queue = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
    defaults.removeObject(forKey: queueKey) // Consommation locale unique, pas preuve métier.
    guard liveBinding() else { return [] }
    return queue.filter { ($0["until"] as? Double ?? 0) > now && $0["bindingId"] as? String == binding?["bindingId"] as? String }.compactMap { $0["event"] as? [String: Any] }
  }
  private func armLease() {
    leaseExpiry?.cancel()
    guard let until = binding?["expiresAt"] as? Double else { return }
    let at = epoch
    let id = binding?["bindingId"] as? String
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.epoch == at, self.binding?["bindingId"] as? String == id,
        self.binding?["expiresAt"] as? Double == until, !self.liveBinding() else { return }
      self.clear()
    }
    leaseExpiry = work
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, (until - now) / 1000), execute: work)
  }
  private func armExpiry(_ uuid: UUID) {
    expiry?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.call == uuid, !self.isConnected else { return }
      self.finish(.unanswered)
    }
    expiry = work
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, (deadline - now) / 1000), execute: work)
  }
  private func current(_ options: [String: Any]) throws -> UUID {
    guard liveBinding(), let uuid = validUUID(options["uuid"]), uuid == call, isConnected || deadline > now else { throw error() }
    return uuid
  }
  func outgoing(_ options: [String: Any]) throws {
    guard liveBinding(), UIApplication.shared.applicationState == .active, call == nil, let uuid = validUUID(options["uuid"]),
      AVAudioSession.sharedInstance().recordPermission == .granted,
      options["video"] as? Bool != true || AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { throw error() }
    call = uuid; deadline = min(now + 45_000, binding?["expiresAt"] as? Double ?? now); isConnected = false
    let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: "ANTSIA"))
    action.isVideo = options["video"] as? Bool == true
    let at = epoch
    controller.request(CXTransaction(action: action)) { [weak self] failure in
      DispatchQueue.main.async { guard let self, failure != nil, self.epoch == at, self.call == uuid else { return }; self.finish(.failed) }
    }
    armExpiry(uuid)
  }
  func answer(_ options: [String: Any]) throws {
    let uuid = try current(options)
    let at = epoch
    controller.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { [weak self] failure in
      DispatchQueue.main.async { guard let self, failure != nil, self.epoch == at, self.call == uuid else { return }; self.finish(.failed) }
    }
  }
  func end(_ options: [String: Any]) throws {
    guard let uuid = validUUID(options["uuid"]) else { throw error() }
    if call == uuid { finish(.remoteEnded) }
  }
  func connected(_ options: [String: Any]) throws {
    let uuid = try current(options)
    guard AVAudioSession.sharedInstance().recordPermission == .granted else { finish(.failed); throw error() }
    try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    isConnected = true; expiry?.cancel()
    pendingAnswer?.fulfill(); pendingAnswer = nil
    if let action = pendingStart { provider?.reportOutgoingCall(with: uuid, connectedAt: Date()); action.fulfill(); pendingStart = nil }
  }
  func clear() {
    finish(.failed); epoch += 1; binding = nil; tokenValues.removeAll(); leaseExpiry?.cancel()
    defaults.removeObject(forKey: bindingKey); defaults.removeObject(forKey: queueKey)
    defaults.removeObject(forKey: seenKey)
    registry?.desiredPushTypes = []
  }
  func clearIfMatching(_ bindingId: String?) {
    if let bindingId, binding?["bindingId"] as? String != bindingId { return }
    clear()
  }
  private func finish(_ reason: CXCallEndedReason) {
    expiry?.cancel(); expiry = nil
    pendingAnswer?.fail(); pendingAnswer = nil; pendingStart?.fail(); pendingStart = nil
    for action in pending.values { action.fail() }; pending.removeAll()
    if let uuid = call {
      provider?.reportCall(with: uuid, endedAt: Date(), reason: reason)
      emit("audioDeactivated", uuid: uuid); emit("end", uuid: uuid)
    }
    call = nil; isConnected = false; deadline = 0
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }
  func providerDidReset(_ provider: CXProvider) { finish(.failed) }
  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard liveBinding(), call == action.callUUID, deadline > now else { action.fail(); finish(.failed); return }
    pendingAnswer = action; emit("answer", uuid: action.callUUID)
    armExpiry(action.callUUID)
  }
  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    guard liveBinding(), call == action.callUUID else { action.fail(); return }
    provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    if isConnected { provider.reportOutgoingCall(with: action.callUUID, connectedAt: Date()); action.fulfill() }
    else { pendingStart = action }
  }
  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    if call == action.callUUID { finish(.remoteEnded) }
    action.fulfill()
  }
  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    action.fail()
    if let callAction = action as? CXCallAction, call == callAction.callUUID { finish(.failed) }
  }
  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    guard liveBinding(), isConnected, let uuid = call else { finish(.failed); return }
    emit("audioActivated", uuid: uuid)
  }
  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) { if let uuid = call { emit("audioDeactivated", uuid: uuid) } }
  private func controlled(_ action: CXCallAction, kind: String, extra: [String: Any]) {
    guard liveBinding(), call == action.callUUID else { action.fail(); return }
    // L'identifiant d'événement sert aussi d'ACK ; aucune réussite avant suspension réelle JS.
    let eventId = action.uuid.uuidString.lowercased()
    pending[eventId] = action
    let fields = extra
    emitAction(kind, uuid: action.callUUID, eventId: eventId, extra: fields)
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
      guard let self, let waiting = self.pending.removeValue(forKey: eventId) else { return }
      waiting.fail(); self.finish(.failed)
    }
  }
  private func emitAction(_ kind: String, uuid: UUID, eventId: String, extra: [String: Any]) {
    // emit génère un identifiant ; le stocker explicitement pour l'action système.
    var fields = extra; fields["eventId"] = eventId
    emit(kind, uuid: uuid, extra: fields)
  }
  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) { controlled(action, kind: "mute", extra: ["muted": action.isMuted]) }
  func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) { controlled(action, kind: "hold", extra: ["held": action.isOnHold]) }
  func complete(_ options: [String: Any]) throws {
    guard liveBinding(), let key = options["eventId"] as? String, let action = pending.removeValue(forKey: key) else { throw error() }
    if options["handled"] as? Bool == true { action.fulfill() } else { action.fail(); finish(.failed) }
  }
}
