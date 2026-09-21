package com.oasis.hris

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

// Reads the device-integrity signals the attendance risk score weighs
// (rooted/emulator/adb/dev-options/VPN). Kept as a small platform channel
// instead of a third-party plugin. Each probe is best-effort: any failure is
// reported as "not flagged" (false) so a mark never crashes on signal capture.
class MainActivity : FlutterActivity() {
    private val channelName = "com.oasis.hris/device_integrity"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "read" -> result.success(readSignals())
                    else -> result.notImplemented()
                }
            }
    }

    private fun readSignals(): Map<String, Boolean> = mapOf(
        "rooted" to safe { isRooted() },
        "emulator" to safe { isEmulator() },
        "adbEnabled" to safe { isAdbEnabled() },
        "devOptionsEnabled" to safe { isDevOptionsEnabled() },
        "vpnActive" to safe { isVpnActive() },
    )

    private inline fun safe(probe: () -> Boolean): Boolean =
        try { probe() } catch (_: Throwable) { false }

    private fun isAdbEnabled(): Boolean =
        Settings.Global.getInt(contentResolver, Settings.Global.ADB_ENABLED, 0) == 1

    private fun isDevOptionsEnabled(): Boolean =
        Settings.Global.getInt(
            contentResolver,
            Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
            0,
        ) == 1

    private fun isVpnActive(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }

    private fun isEmulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.MODEL.contains("google_sdk") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for x86") ||
            Build.MANUFACTURER.contains("Genymotion") ||
            (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")) ||
            Build.PRODUCT == "google_sdk" ||
            Build.HARDWARE.contains("goldfish") ||
            Build.HARDWARE.contains("ranchu")

    private fun isRooted(): Boolean {
        if (Build.TAGS?.contains("test-keys") == true) return true
        val suPaths = listOf(
            "/sbin/su", "/system/bin/su", "/system/xbin/su",
            "/data/local/xbin/su", "/data/local/bin/su", "/data/local/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su", "/su/bin/su",
            "/system/app/Superuser.apk",
        )
        return suPaths.any { File(it).exists() }
    }
}
