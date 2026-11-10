package expo.modules.antsiacalls

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import android.os.Handler
import android.os.Looper

class CallInviteService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    // Un message notification+data contournerait cette admission à froid.
    if (!CallState.enabled(this) || message.notification != null || message.data.keys != setOf("payload") || message.priority != RemoteMessage.PRIORITY_HIGH) return
    val raw = message.data["payload"] ?: return
    if (raw.length > 8192) return
    try {
      val payload = JSONObject(raw)
      Handler(Looper.getMainLooper()).post {
        CallState.receive(this, payload)
        if (CallState.active()?.uuid == payload.optString("uuid").lowercase()) TelecomCallService.start(this)
      }
    } catch (_: Exception) { /* Fermé ; aucun corps privé ni token journalisé. */ }
  }
  override fun onNewToken(token: String) { Handler(Looper.getMainLooper()).post { CallState.initialize(this); CallState.token(this, token) } }
}
