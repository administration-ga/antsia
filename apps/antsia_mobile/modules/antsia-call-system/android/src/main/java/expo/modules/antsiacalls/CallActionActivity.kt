package expo.modules.antsiacalls

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class CallActionActivity : Activity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    CallState.initialize(this)
    val uuid = intent.getStringExtra("uuid") ?: ""
    try {
      if (intent.action == "antsia.calls.ANSWER") {
        CallState.answerIntent(this, uuid)
        packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
      }
    } catch (_: Exception) { CallState.end(this, uuid) }
    finish()
  }
}
