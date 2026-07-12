import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => 'ApiException($status): $message';
}

/// Thin backend client. Attaches the bearer token from the provided callback.
class ApiClient {
  ApiClient(this._token);

  final Future<String?> Function() _token;

  Future<Map<String, dynamic>> getProfile() => _getJson('/me/profile');

  Future<Map<String, dynamic>> getAttendanceToday() =>
      _getJson('/me/attendance/today');

  /// Posts one attendance event (check_in/check_out/break_start/break_end)
  /// with the captured location and device signals.
  Future<Map<String, dynamic>> markAttendance(Map<String, dynamic> body) =>
      _postJson('/me/attendance/events', body);

  /// Raises an approval-gated device-change request for the current device.
  Future<Map<String, dynamic>> requestDeviceRebind(Map<String, dynamic> body) =>
      _postJson('/me/devices/rebind-requests', body);

  Future<Map<String, dynamic>> _getJson(String path) async {
    final token = await _token();
    final res = await http.get(
      Uri.parse('${AppConfig.apiBase}$path'),
      headers: {if (token != null) 'Authorization': 'Bearer $token'},
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> _postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = await _token();
    final res = await http.post(
      Uri.parse('${AppConfig.apiBase}$path'),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: json.encode(body),
    );
    return _decode(res);
  }

  Map<String, dynamic> _decode(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return json.decode(res.body) as Map<String, dynamic>;
    }
    // The backend returns Nest error envelopes: { message, ... }. Surface the
    // human-readable message when present, else the raw body.
    String message = res.body;
    try {
      final decoded = json.decode(res.body);
      if (decoded is Map && decoded['message'] != null) {
        final m = decoded['message'];
        message = m is List ? m.join(', ') : m.toString();
      }
    } catch (_) {
      // Non-JSON body; keep the raw text.
    }
    throw ApiException(res.statusCode, message);
  }
}
