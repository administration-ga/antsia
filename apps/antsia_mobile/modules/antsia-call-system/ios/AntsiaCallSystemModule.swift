// P17c, écrit depuis les API Apple/Expo documentées ; aucun code d'un autre produit.
import ExpoModulesCore
import AVFoundation
import UserNotifications

public class AntsiaCallSystemModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AntsiaCallSystem")
    Events("onCallEvent")
    OnCreate {
      DispatchQueue.main.async {
        AntsiaCallCoordinator.shared.signal = { [weak self] in self?.sendEvent("onCallEvent", [:]) }
      }
    }
    AsyncFunction("capabilities") { () -> [String: Any] in
      ["enabled": AntsiaCallCoordinator.enabled, "platform": "ios", "fullScreen": AntsiaCallCoordinator.enabled]
    }
    AsyncFunction("configure") { (binding: [String: Any]) in try AntsiaCallCoordinator.shared.configure(binding) }.runOnQueue(.main)
    AsyncFunction("tokens") { () -> [[String: String]] in AntsiaCallCoordinator.shared.tokens() }.runOnQueue(.main)
    AsyncFunction("drainEvents") { () -> [[String: Any]] in AntsiaCallCoordinator.shared.drain() }.runOnQueue(.main)
    AsyncFunction("clear") { (options: [String: String]) in AntsiaCallCoordinator.shared.clearIfMatching(options["bindingId"]) }.runOnQueue(.main)
    AsyncFunction("showOutgoing") { (options: [String: Any]) in try AntsiaCallCoordinator.shared.outgoing(options) }.runOnQueue(.main)
    AsyncFunction("answer") { (options: [String: Any]) in try AntsiaCallCoordinator.shared.answer(options) }.runOnQueue(.main)
    AsyncFunction("end") { (options: [String: Any]) in try AntsiaCallCoordinator.shared.end(options) }.runOnQueue(.main)
    AsyncFunction("setConnected") { (options: [String: Any]) in try AntsiaCallCoordinator.shared.connected(options) }.runOnQueue(.main)
    AsyncFunction("completeAction") { (options: [String: Any]) in try AntsiaCallCoordinator.shared.complete(options) }.runOnQueue(.main)
    AsyncFunction("requestPermissions") { (options: [String: Bool], promise: Promise) in
      guard AntsiaCallCoordinator.enabled, UIApplication.shared.applicationState == .active else {
        promise.resolve(["microphone": false, "camera": false, "notifications": false]); return
      }
      let epoch = AntsiaCallCoordinator.shared.epoch
      let afterMicrophone: (Bool) -> Void = { microphone in
        let finishCamera: (Bool) -> Void = { camera in
          let finish: (Bool) -> Void = { notifications in
            DispatchQueue.main.async {
              let current = epoch == AntsiaCallCoordinator.shared.epoch
              if notifications && current { UIApplication.shared.registerForRemoteNotifications() }
              promise.resolve(["microphone": microphone && current, "camera": camera && current, "notifications": notifications && current])
            }
          }
          if options["notifications"] == true {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { allowed, _ in finish(allowed) }
          } else {
            UNUserNotificationCenter.current().getNotificationSettings { finish($0.authorizationStatus == .authorized) }
          }
        }
        if options["video"] == true { AVCaptureDevice.requestAccess(for: .video, completionHandler: finishCamera) }
        else { finishCamera(AVCaptureDevice.authorizationStatus(for: .video) == .authorized) }
      }
      if options["microphone"] == false { afterMicrophone(AVAudioSession.sharedInstance().recordPermission == .granted) }
      else { AVAudioSession.sharedInstance().requestRecordPermission(afterMicrophone) }
    }.runOnQueue(.main)
  }
}
