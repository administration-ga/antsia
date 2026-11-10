// P17c : références seulement ; aucun token/bearer/nom dans SharedPreferences.
package expo.modules.antsiacalls

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallControlResult
import androidx.core.telecom.CallAttributesCompat
import android.telecom.DisconnectCause
import expo.modules.kotlin.Promise
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal object CallState {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val handler = Handler(Looper.getMainLooper())
  private val uuidPattern = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
  private val refPattern = Regex("^[a-z0-9]{16,64}$")
  private var initialized = false
  private var current: ActiveCall? = null
  private val controls = mutableMapOf<String, CompletableDeferred<Boolean>>()
  var signal: (() -> Unit)? = null
  var visible = false; private set
  var epoch = 0; private set
  data class ActiveCall(val uuid: String, val payload: JSONObject?, val video: Boolean, val outgoing: Boolean, val expiresAt: Long, val elapsedDeadline: Long, var control: CallControlScope? = null, var connected: Boolean = false, var answering: Boolean = false, var completion: CompletableDeferred<Boolean>? = null)
  private fun prefs(context: Context) = context.getSharedPreferences("antsia.calls.v1", Context.MODE_PRIVATE)
  fun enabled(context: Context): Boolean = try {
    android.os.Build.VERSION.SDK_INT >= 26 && context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData?.getBoolean("AntsiaNativeCallsEnabled", false) == true
      && com.google.firebase.FirebaseApp.getApps(context).isNotEmpty()
  } catch (_: Exception) { false }
  fun initialize(context: Context) {
    synchronized(this) {
      if (initialized) return
      initialized = true
      (context.applicationContext as Application).registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
        private var resumed = 0
        override fun onActivityResumed(activity: Activity) { resumed++; visible = resumed > 0 }
        override fun onActivityPaused(activity: Activity) { resumed = (resumed - 1).coerceAtLeast(0); visible = resumed > 0 }
        override fun onActivityCreated(a: Activity, state: Bundle?) {}
        override fun onActivityStarted(a: Activity) {}
        override fun onActivityStopped(a: Activity) {}
        override fun onActivitySaveInstanceState(a: Activity, state: Bundle) {}
        override fun onActivityDestroyed(a: Activity) {}
      })
    }
  }
  fun permission(context: Context, permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  private fun binding(context: Context): JSONObject? = try { JSONObject(prefs(context).getString("binding", "") ?: "") } catch (_: Exception) { null }
  fun live(context: Context): Boolean = enabled(context) && (binding(context)?.optLong("expiresAt") ?: 0) > System.currentTimeMillis()
  fun configure(context: Context, value: Map<String, Any>) {
    initialize(context)
    require(enabled(context) && value.keys == setOf("applicationId", "deviceId", "bindingId", "expiresAt")) { "nativeCallUnavailable" }
    require((value["applicationId"] as? String)?.matches(Regex("^[a-z][a-z0-9_-]{1,63}$")) == true)
    require((value["deviceId"] as? String)?.length?.let { it in 8..128 } == true && (value["bindingId"] as? String)?.matches(uuidPattern) == true)
    val until = (value["expiresAt"] as? Number)?.toDouble() ?: 0.0
    require(until.isFinite() && until == until.toLong().toDouble() && until <= 9_007_199_254_740_991.0 && until > System.currentTimeMillis())
    val old = binding(context)
    if (old?.optString("bindingId") != value["bindingId"] || old?.optString("applicationId") != value["applicationId"] || old?.optString("deviceId") != value["deviceId"]) clear(context)
    check(prefs(context).edit().putString("binding", JSONObject(value).toString()).commit())
    val id = value["bindingId"]
    handler.postDelayed({ if (binding(context)?.optString("bindingId") == id && !live(context)) clear(context) }, (until.toLong() - System.currentTimeMillis()).coerceAtLeast(1))
  }
  fun admit(context: Context, payload: JSONObject): Boolean {
    val binding = binding(context) ?: return false
    val now = System.currentTimeMillis()
    return live(context) && payload.keys().asSequence().toSet() == setOf("version", "kind", "phase", "networkId", "reference", "applicationId", "bindingId", "uuid", "expiresAt")
      && payload.opt("version") == 1 && payload.optString("kind") == "antsia.call" && payload.optString("phase") == "ring"
      && payload.optString("networkId").matches(refPattern) && payload.optString("reference").matches(refPattern)
      && payload.optString("uuid").matches(uuidPattern) && payload.optString("bindingId").matches(uuidPattern)
      && payload.optString("applicationId") == binding.optString("applicationId") && payload.optString("bindingId") == binding.optString("bindingId")
      && payload.opt("expiresAt") is Number && payload.optDouble("expiresAt") == payload.optLong("expiresAt").toDouble()
      && payload.optLong("expiresAt") > now && payload.optLong("expiresAt") <= now + 45_000 && payload.optLong("expiresAt") <= binding.optLong("expiresAt")
  }
  @Synchronized fun receive(context: Context, payload: JSONObject) {
    initialize(context)
    if (!admit(context, payload)) return
    val uuid = payload.getString("uuid").lowercase()
    val now = System.currentTimeMillis()
    val seen = try { JSONObject(prefs(context).getString("seen", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    val liveSeen = JSONObject()
    seen.keys().asSequence().filter { seen.optLong(it) > now }.take(31).forEach { liveSeen.put(it, seen.getLong(it)) }
    if (liveSeen.has(uuid) || current != null) return
    liveSeen.put(uuid, payload.getLong("expiresAt") + 60_000)
    if (!prefs(context).edit().putString("seen", liveSeen.toString()).commit()) return
    current = ActiveCall(uuid, payload, false, false, payload.getLong("expiresAt"), SystemClock.elapsedRealtime() + payload.getLong("expiresAt") - now)
    emit(context, "incoming", uuid, mapOf("payload" to jsonMap(payload)))
    arm(context, requireNotNull(current))
  }
  @Synchronized fun active(): ActiveCall? = current
  private fun arm(context: Context, call: ActiveCall) {
    handler.postDelayed({
      if (current === call && (!call.connected || !live(context))) finish(context, call, DisconnectCause.MISSED)
    }, (call.elapsedDeadline - SystemClock.elapsedRealtime()).coerceAtLeast(1))
  }
  fun outgoing(context: Context, options: Map<String, Any>) {
    val uuid = options["uuid"] as? String ?: ""
    require(live(context) && visible && permission(context, Manifest.permission.RECORD_AUDIO) && uuid.matches(uuidPattern) && current == null) { "nativeCallUnavailable" }
    require(options["video"] != true || permission(context, Manifest.permission.CAMERA)) { "nativeCallUnavailable" }
    val until = minOf(System.currentTimeMillis() + 45_000, binding(context)?.optLong("expiresAt") ?: 0)
    val call = ActiveCall(uuid.lowercase(), null, options["video"] == true, true, until, SystemClock.elapsedRealtime() + until - System.currentTimeMillis())
    current = call; arm(context, call)
    TelecomCallService.start(context)
  }
  fun answerIntent(context: Context, uuid: String) {
    val call = current
    require(live(context) && call != null && call.uuid.equals(uuid, true) && !call.connected && call.expiresAt > System.currentTimeMillis()) { "nativeCallUnavailable" }
    if (!call.answering) { call.answering = true; TelecomCallService.stopRinging(call.uuid); emit(context, "answer", call.uuid) }
  }
  suspend fun systemAnswer(context: Context, call: ActiveCall) {
    if (current !== call || !live(context) || !permission(context, Manifest.permission.RECORD_AUDIO) || !visible) throw IllegalStateException("nativeCallUnavailable")
    val ready = CompletableDeferred<Boolean>(); call.completion = ready
    answerIntent(context, call.uuid)
    val accepted = withTimeoutOrNull(4_000) { ready.await() } == true
    if (!accepted) { finish(context, call, DisconnectCause.REJECTED); throw IllegalStateException("nativeCallUnavailable") }
  }
  fun connected(context: Context, uuid: String, promise: Promise) {
    val call = current
    if (call != null && call.uuid.equals(uuid, true) && call.connected && live(context)) { promise.resolve(); return }
    if (call == null || !call.uuid.equals(uuid, true) || !live(context) || !visible || !permission(context, Manifest.permission.RECORD_AUDIO) || call.expiresAt <= System.currentTimeMillis() || call.elapsedDeadline <= SystemClock.elapsedRealtime()) {
      if (call != null) finish(context, call, DisconnectCause.REJECTED)
      promise.reject("NATIVE_CALL_UNAVAILABLE", "nativeCallUnavailable", null); return
    }
    scope.launch {
      try {
        val control = requireNotNull(call.control)
        if (call.completion != null) call.completion?.complete(true)
        else {
          val result = if (call.outgoing) control.setActive() else control.answer(CallAttributesCompat.CALL_TYPE_AUDIO_CALL)
          check(result is CallControlResult.Success)
        }
        check(current === call && live(context) && visible)
        check(TelecomCallService.activateMicrophone(context))
        call.connected = true
        emit(context, "audioActivated", call.uuid)
        promise.resolve()
      } catch (_: Exception) {
        finish(context, call, DisconnectCause.REJECTED)
        promise.reject("NATIVE_CALL_UNAVAILABLE", "nativeCallUnavailable", null)
      }
    }
  }
  suspend fun systemHold(context: Context, call: ActiveCall, held: Boolean) {
    val id = UUID.randomUUID().toString()
    val result = CompletableDeferred<Boolean>(); controls[id] = result
    emit(context, "hold", call.uuid, mapOf("held" to held), id)
    if (withTimeoutOrNull(4_000) { result.await() } != true) { controls.remove(id); finish(context, call, DisconnectCause.LOCAL); throw IllegalStateException("nativeCallUnavailable") }
    controls.remove(id)
  }
  suspend fun systemMute(context: Context, call: ActiveCall, muted: Boolean) {
    if (current !== call || !call.connected) return
    val id = UUID.randomUUID().toString()
    val result = CompletableDeferred<Boolean>(); controls[id] = result
    emit(context, "mute", call.uuid, mapOf("muted" to muted), id)
    if (withTimeoutOrNull(4_000) { result.await() } != true) { controls.remove(id); finish(context, call, DisconnectCause.LOCAL); throw IllegalStateException("nativeCallUnavailable") }
    controls.remove(id)
  }
  fun complete(context: Context, value: Map<String, Any>) {
    require(live(context))
    val waiting = controls.remove(value["eventId"] as? String ?: "") ?: throw IllegalStateException("nativeCallUnavailable")
    waiting.complete(value["handled"] == true)
  }
  fun end(context: Context, uuid: String) { val call = current; if (call != null && call.uuid.equals(uuid, true)) finish(context, call, DisconnectCause.LOCAL) }
  fun finish(context: Context, call: ActiveCall, cause: Int) {
    if (current !== call) return
    current = null
    TelecomCallService.stopRinging(call.uuid)
    call.completion?.complete(false)
    controls.values.forEach { it.complete(false) }; controls.clear()
    emit(context, "audioDeactivated", call.uuid); emit(context, "end", call.uuid)
    scope.launch { try { call.control?.disconnect(DisconnectCause(cause)) } catch (_: Exception) { /* OS déjà terminé */ } }
    context.stopService(Intent(context, TelecomCallService::class.java))
  }
  fun clear(context: Context, expectedBindingId: String? = null) {
    if (expectedBindingId != null && binding(context)?.optString("bindingId") != expectedBindingId) return
    current?.let { finish(context, it, DisconnectCause.LOCAL) }
    epoch += 1
    check(prefs(context).edit().clear().commit()) { "nativeCallPurgeFailed" }
  }
  @Synchronized fun emit(context: Context, kind: String, uuid: String? = null, extra: Map<String, Any> = emptyMap(), eventId: String = UUID.randomUUID().toString()) {
    if (!live(context)) return
    val event = JSONObject(extra); event.put("eventId", eventId); event.put("kind", kind)
    if (uuid != null) event.put("uuid", uuid)
    val bindingId = binding(context)?.optString("bindingId") ?: return
    val now = System.currentTimeMillis()
    val queue = queue(context).filter { it.optLong("until") > now && it.optString("bindingId") == bindingId }.takeLast(31).toMutableList()
    queue.add(JSONObject().put("event", event).put("bindingId", bindingId).put("until", minOf(now + 60_000, binding(context)?.optLong("expiresAt") ?: now)))
    if (prefs(context).edit().putString("events", JSONArray(queue).toString()).commit()) signal?.invoke()
  }
  private fun queue(context: Context): List<JSONObject> = try {
    val array = JSONArray(prefs(context).getString("events", "[]") ?: "[]")
    (0 until minOf(array.length(), 32)).map { array.getJSONObject(it) }
  } catch (_: Exception) { emptyList() }
  @Synchronized fun drain(context: Context): List<Map<String, Any>> {
    val entries = queue(context)
    check(prefs(context).edit().remove("events").commit()) { "nativeCallPurgeFailed" }
    val id = binding(context)?.optString("bindingId")
    val stored = if (!live(context)) emptyList() else entries.filter { it.optLong("until") > System.currentTimeMillis() && it.optString("bindingId") == id }.map { jsonMap(it.getJSONObject("event")) }
    return stored
  }
  fun token(context: Context, value: String) {
    if (!live(context) || value.length > 4096) return
    emit(context, "token", extra = mapOf("provider" to "fcm"))
  }
  private fun jsonMap(value: JSONObject): Map<String, Any> = value.keys().asSequence().associateWith { key ->
    val item = value.get(key); if (item is JSONObject) jsonMap(item) else item
  }
}
