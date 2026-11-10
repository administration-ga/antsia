package expo.modules.antsiacalls

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

// Découvert par Expo Autolinking : observer Activity avant le montage React.
class AntsiaCallSystemPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> = listOf(object : ApplicationLifecycleListener {
    override fun onCreate(application: Application) { CallState.initialize(application) }
  })
}
