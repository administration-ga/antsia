package expo.modules.antsiacalls

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues

class AntsiaCallSystemModule : Module() {
  private fun context(): Context = requireNotNull(appContext.reactContext).applicationContext
  override fun definition() = ModuleDefinition {
    Name("AntsiaCallSystem")
    Events("onCallEvent")
    OnCreate {
      CallState.initialize(context())
      val module = java.lang.ref.WeakReference(this@AntsiaCallSystemModule)
      CallState.signal = { module.get()?.sendEvent("onCallEvent", emptyMap<String, Any>()) }
    }
    AsyncFunction("capabilities") {
      mapOf("enabled" to CallState.enabled(context()), "platform" to "android", "fullScreen" to false)
    }
    AsyncFunction("configure") { value: Map<String, Any> -> CallState.configure(context(), value) }.runOnQueue(Queues.MAIN)
    AsyncFunction("tokens") { promise: Promise ->
      val context = context()
      val epoch = CallState.epoch
      if (!CallState.live(context)) promise.resolve(emptyList<Any>())
      else com.google.firebase.messaging.FirebaseMessaging.getInstance().token
        .addOnSuccessListener { token -> promise.resolve(if (epoch == CallState.epoch && CallState.live(context)) listOf(mapOf("provider" to "fcm", "token" to token)) else emptyList()) }
        .addOnFailureListener { promise.reject("NATIVE_CALL_UNAVAILABLE", "nativeCallUnavailable", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("drainEvents") { CallState.drain(context()) }.runOnQueue(Queues.MAIN)
    AsyncFunction("clear") { options: Map<String, String> -> CallState.clear(context(), options["bindingId"]) }.runOnQueue(Queues.MAIN)
    AsyncFunction("showOutgoing") { options: Map<String, Any> -> CallState.outgoing(context(), options) }.runOnQueue(Queues.MAIN)
    AsyncFunction("answer") { options: Map<String, Any> -> CallState.answerIntent(context(), options["uuid"] as? String ?: "") }.runOnQueue(Queues.MAIN)
    AsyncFunction("end") { options: Map<String, Any> -> CallState.end(context(), options["uuid"] as? String ?: "") }.runOnQueue(Queues.MAIN)
    AsyncFunction("setConnected") { options: Map<String, Any>, promise: Promise -> CallState.connected(context(), options["uuid"] as? String ?: "", promise) }.runOnQueue(Queues.MAIN)
    AsyncFunction("completeAction") { options: Map<String, Any> -> CallState.complete(context(), options) }.runOnQueue(Queues.MAIN)
    AsyncFunction("requestPermissions") { options: Map<String, Boolean>, promise: Promise ->
      val context = context()
      if (!CallState.enabled(context) || appContext.currentActivity == null || !CallState.visible) {
        promise.resolve(mapOf("microphone" to false, "camera" to false, "notifications" to false))
      } else {
        val epoch = CallState.epoch
        val permissions = mutableListOf<String>()
        if (options["microphone"] != false) permissions.add(Manifest.permission.RECORD_AUDIO)
        if (options["video"] == true) permissions.add(Manifest.permission.CAMERA)
        if (options["notifications"] == true && Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        val manager = appContext.permissions
        if (manager == null) promise.reject("NATIVE_CALL_UNAVAILABLE", "nativeCallUnavailable", null)
        else {
          val respond = {
            val current = epoch == CallState.epoch && CallState.enabled(context)
            promise.resolve(mapOf(
              "microphone" to (current && CallState.permission(context, Manifest.permission.RECORD_AUDIO)),
              "camera" to (current && CallState.permission(context, Manifest.permission.CAMERA)),
              "notifications" to (current && context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() == true),
            ))
          }
          if (permissions.isEmpty()) respond() else manager.askForPermissions({ _ -> respond() }, *permissions.toTypedArray())
        }
      }
    }.runOnQueue(Queues.MAIN)
  }
}
