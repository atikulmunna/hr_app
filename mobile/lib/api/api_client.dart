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

  Future<Map<String, dynamic>> _getJson(String path) async {
    final token = await _token();
    final res = await http.get(
      Uri.parse('${AppConfig.apiBase}$path'),
      headers: {
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return json.decode(res.body) as Map<String, dynamic>;
    }
    throw ApiException(res.statusCode, res.body);
  }
}
