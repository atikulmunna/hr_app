import 'dart:io';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A stable per-install device identifier used for attendance device binding.
/// Generated once and kept in secure storage, so it survives app restarts but
/// resets on reinstall (which then requires an approved re-bind).
abstract final class DeviceIdentity {
  static const _storage = FlutterSecureStorage();
  static const _key = 'device_fingerprint';

  static Future<String> fingerprint() async {
    final existing = await _storage.read(key: _key);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final generated = _randomHex(32);
    await _storage.write(key: _key, value: generated);
    return generated;
  }

  static String get platform {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return 'other';
  }

  static String _randomHex(int length) {
    final rng = Random.secure();
    final buffer = StringBuffer();
    for (var i = 0; i < length; i++) {
      buffer.write(rng.nextInt(16).toRadixString(16));
    }
    return buffer.toString();
  }
}
