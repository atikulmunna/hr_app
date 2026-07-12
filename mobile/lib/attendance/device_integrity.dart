import 'dart:io';
import 'package:flutter/services.dart';

/// Reads best-effort device-integrity signals (rooted/emulator/adb/dev-options/
/// VPN) from the Android host channel. On other platforms, or if the channel is
/// unavailable, it returns an empty map so the signals are posted as null and
/// scored by the backend as "not flagged" (null-not-false).
abstract final class DeviceIntegrity {
  static const _channel = MethodChannel('com.example.hris/device_integrity');

  static Future<Map<String, bool>> read() async {
    if (!Platform.isAndroid) return const {};
    try {
      final result = await _channel.invokeMapMethod<String, dynamic>('read');
      if (result == null) return const {};
      return {
        for (final entry in result.entries)
          if (entry.value is bool) entry.key: entry.value as bool,
      };
    } on PlatformException {
      return const {};
    } on MissingPluginException {
      return const {};
    }
  }
}
