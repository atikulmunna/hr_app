import 'package:geolocator/geolocator.dart';
import 'device_identity.dart';
import 'device_integrity.dart';

/// Raised when a location fix cannot be obtained (services off or permission
/// denied). The message is safe to show to the user.
class LocationUnavailable implements Exception {
  LocationUnavailable(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Captures the current location and the device signals the backend scores.
/// The returned map is merged with the event type before posting.
///
/// Only the signals we can read cheaply on a real device are sent. Absent
/// signals are treated by the backend as "not flagged", so we never fabricate
/// values we cannot actually observe.
Future<Map<String, dynamic>> captureAttendanceSignals() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw LocationUnavailable('Turn on location services to mark attendance.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    throw LocationUnavailable(
      'Location permission is needed to verify your presence.',
    );
  }

  final position = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
  );

  final integrity = await DeviceIntegrity.read();

  return {
    'lat': position.latitude,
    'lng': position.longitude,
    'accuracyM': position.accuracy,
    'isMock': position.isMocked,
    'provider': 'gps',
    'deviceFingerprint': await DeviceIdentity.fingerprint(),
    'platform': DeviceIdentity.platform,
    // rooted / emulator / adbEnabled / devOptionsEnabled / vpnActive; absent on
    // non-Android hosts, where they are posted as null and scored as unflagged.
    ...integrity,
  };
}
