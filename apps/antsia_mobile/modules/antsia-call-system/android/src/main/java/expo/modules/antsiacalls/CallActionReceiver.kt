package expo.modules.antsiacalls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != "antsia.calls.END") return
    CallState.initialize(context)
    CallState.end(context, intent.getStringExtra("uuid") ?: "")
  }
}
