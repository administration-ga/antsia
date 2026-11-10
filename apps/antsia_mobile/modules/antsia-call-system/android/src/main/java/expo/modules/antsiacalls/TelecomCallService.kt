package expo.modules.antsiacalls

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.telecom.DisconnectCause
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallsManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.collect

/** Le service de sonnerie est phoneCall seulement ; aucune ouverture du micro. */
class TelecomCallService : Service() {
  private val worker = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var callJob: Job? = null
  private var ownedCall: CallState.ActiveCall? = null
  private lateinit var calls: CallsManager
  private val ringHandler = Handler(Looper.getMainLooper())
  private var ringtone: Ringtone? = null
  private var ringLoop: Runnable? = null
  companion object {
    private const val CHANNEL = "antsia.calls"
    private const val NOTIFICATION_ID = 1703
    private var running: TelecomCallService? = null
    fun start(context: Context) {
      try { ContextCompat.startForegroundService(context, Intent(context, TelecomCallService::class.java)) }
      catch (_: Exception) { CallState.active()?.let { CallState.finish(context, it, DisconnectCause.REJECTED) } }
    }
    fun activateMicrophone(context: Context): Boolean {
      val service = running ?: return false
      if (!CallState.visible || !CallState.permission(context, Manifest.permission.RECORD_AUDIO)) return false
      return try {
        service.stopRinging()
        val notification = service.notification(ongoing = true)
        if (Build.VERSION.SDK_INT >= 30) service.startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else service.startForeground(NOTIFICATION_ID, notification)
        true
      } catch (_: Exception) { false }
    }
    fun stopRinging(uuid: String) { if (running?.ownedCall?.uuid == uuid) running?.stopRinging() }
  }
  override fun onCreate() {
    super.onCreate()
    CallState.initialize(this)
    running = this
    calls = CallsManager(this)
    val channel = NotificationChannel(CHANNEL, "ANTSIA", NotificationManager.IMPORTANCE_HIGH)
    channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val call = CallState.active()
    if (!CallState.live(this) || call == null) { stopSelf(); return START_NOT_STICKY }
    if (callJob != null) {
      if (ownedCall !== call) CallState.finish(this, call, DisconnectCause.REJECTED)
      return START_NOT_STICKY
    }
    ownedCall = call
    try {
      calls.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE or CallsManager.CAPABILITY_SUPPORTS_VIDEO_CALLING)
      // Sous 5 secondes, sans attente React, token, réseau ou permission micro.
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification(false), ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
      else startForeground(NOTIFICATION_ID, notification(false))
    } catch (_: Exception) { CallState.finish(this, call, DisconnectCause.REJECTED); stopSelf(); return START_NOT_STICKY }
    callJob = worker.launch {
      try {
        val attributes = CallAttributesCompat(
          displayName = "ANTSIA",
          address = Uri.fromParts("sip", call.uuid, null),
          direction = if (call.outgoing) CallAttributesCompat.DIRECTION_OUTGOING else CallAttributesCompat.DIRECTION_INCOMING,
          callType = if (call.video) CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
          callCapabilities = CallAttributesCompat.SUPPORTS_SET_INACTIVE,
        )
        calls.addCall(
          attributes,
          onAnswer = { _ -> CallState.systemAnswer(this@TelecomCallService, call) },
          onDisconnect = { cause -> CallState.finish(this@TelecomCallService, call, cause.code) },
          onSetActive = { CallState.systemHold(this@TelecomCallService, call, false) },
          onSetInactive = { CallState.systemHold(this@TelecomCallService, call, true) },
        ) {
          if (CallState.active() !== call || !CallState.live(this@TelecomCallService)) {
            launch { disconnect(DisconnectCause(DisconnectCause.LOCAL)) }
            return@addCall
          }
          call.control = this
          if (!call.outgoing && !call.answering) startRinging(call)
          launch { isMuted.drop(1).collect { muted -> CallState.systemMute(this@TelecomCallService, call, muted) } }
        }
      } catch (_: Exception) { CallState.finish(this@TelecomCallService, call, DisconnectCause.LOCAL) }
      finally { if (CallState.active() === call) CallState.finish(this@TelecomCallService, call, DisconnectCause.LOCAL) }
    }
    return START_NOT_STICKY
  }
  private fun notification(ongoing: Boolean): Notification {
    val call = requireNotNull(CallState.active())
    val end = PendingIntent.getBroadcast(this, call.uuid.hashCode(), Intent(this, CallActionReceiver::class.java).setAction("antsia.calls.END").putExtra("uuid", call.uuid), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val answer = PendingIntent.getActivity(this, call.uuid.hashCode(), Intent(this, CallActionActivity::class.java).setAction("antsia.calls.ANSWER").putExtra("uuid", call.uuid), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val person = Person.Builder().setName("ANTSIA").setImportant(true).build()
    val builder = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(if (applicationInfo.icon != 0) applicationInfo.icon else android.R.drawable.sym_call_incoming)
      .setContentTitle("ANTSIA").setCategory(NotificationCompat.CATEGORY_CALL)
      .setSilent(true) // La boucle native possède le son, sans double sonnerie.
      .setOngoing(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setTimeoutAfter(if (ongoing) 0 else (call.expiresAt - System.currentTimeMillis()).coerceAtLeast(1))
      .setStyle(if (ongoing || call.outgoing) NotificationCompat.CallStyle.forOngoingCall(person, end) else NotificationCompat.CallStyle.forIncomingCall(person, end, answer))
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      builder.setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    // Pas de permission plein écran présumée : actions et notification restent utiles.
    return builder.build()
  }
  private fun startRinging(call: CallState.ActiveCall) {
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = manager.getNotificationChannel(CHANNEL) ?: return
    val audio = getSystemService(AudioManager::class.java) ?: return
    if (manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL || audio.ringerMode != AudioManager.RINGER_MODE_NORMAL || channel.importance < NotificationManager.IMPORTANCE_HIGH || channel.sound == null) return
    try {
      ringtone = RingtoneManager.getRingtone(this, channel.sound)?.apply {
        audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        if (Build.VERSION.SDK_INT >= 28) isLooping = true
      }
      val loop = object : Runnable {
        override fun run() {
          if (CallState.active() !== call || call.answering || call.connected || call.expiresAt <= System.currentTimeMillis() || !CallState.live(this@TelecomCallService)) { stopRinging(); return }
          if (manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL || audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) { stopRinging(); return }
          try { if (ringtone?.isPlaying == false) ringtone?.play() }
          catch (_: Exception) { stopRinging(); return }
          ringHandler.postDelayed(this, 1_000)
        }
      }
      ringLoop = loop; ringHandler.post(loop)
    } catch (_: Exception) { stopRinging() }
  }
  private fun stopRinging() {
    ringLoop?.let { ringHandler.removeCallbacks(it) }; ringLoop = null
    try { ringtone?.stop() } catch (_: Exception) { /* ressource déjà libérée */ }
    ringtone = null
  }
  override fun onDestroy() {
    stopRinging()
    ownedCall?.let { CallState.finish(this, it, DisconnectCause.LOCAL) }
    worker.cancel()
    if (running === this) running = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
