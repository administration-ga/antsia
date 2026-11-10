import ExpoModulesCore
import UIKit

public class AntsiaCallsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func appDelegateWillBeginInitialization() {
    // Ce singleton est prêt avant React et n'attend aucune instance de module JS.
    if AntsiaCallCoordinator.enabled { AntsiaCallCoordinator.shared.start() }
  }
  public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    guard AntsiaCallCoordinator.enabled else { return }
    AntsiaCallCoordinator.shared.token("apns", deviceToken)
  }
}
