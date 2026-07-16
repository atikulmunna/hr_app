import 'package:flutter/foundation.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../api/api_client.dart';
import '../config/app_config.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Owns the OIDC session: login via Keycloak, token refresh, secure storage,
/// and the current employee profile loaded from the backend.
class AuthController extends ChangeNotifier {
  final FlutterAppAuth _appAuth = FlutterAppAuth();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  AuthStatus status = AuthStatus.unknown;
  Map<String, dynamic>? profile;
  String? error;

  String? _accessToken;
  String? _refreshToken;
  DateTime? _expiry;

  late final ApiClient api = ApiClient(validAccessToken);

  Future<void> init() async {
    _accessToken = await _storage.read(key: 'access_token');
    _refreshToken = await _storage.read(key: 'refresh_token');
    final exp = await _storage.read(key: 'expiry');
    _expiry = exp != null ? DateTime.tryParse(exp) : null;

    if (_accessToken != null || _refreshToken != null) {
      try {
        await _loadProfile();
        status = AuthStatus.authenticated;
      } catch (_) {
        status = AuthStatus.unauthenticated;
      }
    } else {
      status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> signIn() async {
    error = null;
    try {
      debugPrint('AUTH: authorize starting');
      final res = await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          AppConfig.clientId,
          AppConfig.redirectUrl,
          discoveryUrl: AppConfig.discoveryUrl,
          scopes: AppConfig.scopes,
          allowInsecureConnections: true,
        ),
      );
      debugPrint(
        'AUTH: token exchange ok, accessToken length='
        '${res.accessToken?.length}',
      );
      await _saveTokens(
        res.accessToken,
        res.refreshToken,
        res.accessTokenExpirationDateTime,
      );
      debugPrint('AUTH: loading profile from backend');
      await _loadProfile();
      debugPrint('AUTH: profile loaded ok');
      status = AuthStatus.authenticated;
    } catch (e, st) {
      debugPrint('AUTH ERROR: $e');
      debugPrint('$st');
      error = e.toString();
      status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> signOut() async {
    await _storage.deleteAll();
    _accessToken = null;
    _refreshToken = null;
    _expiry = null;
    profile = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// A currently valid access token, refreshed if it is near expiry.
  Future<String?> validAccessToken() async {
    final stillValid =
        _accessToken != null &&
        _expiry != null &&
        _expiry!.isAfter(DateTime.now().add(const Duration(seconds: 30)));
    if (stillValid) {
      return _accessToken;
    }
    if (_refreshToken == null) {
      return _accessToken;
    }
    try {
      final res = await _appAuth.token(
        TokenRequest(
          AppConfig.clientId,
          AppConfig.redirectUrl,
          discoveryUrl: AppConfig.discoveryUrl,
          refreshToken: _refreshToken,
          grantType: 'refresh_token',
          scopes: AppConfig.scopes,
          allowInsecureConnections: true,
        ),
      );
      await _saveTokens(
        res.accessToken,
        res.refreshToken ?? _refreshToken,
        res.accessTokenExpirationDateTime,
      );
    } catch (_) {
      // Fall back to the existing token; a 401 will surface downstream.
    }
    return _accessToken;
  }

  Future<void> _loadProfile() async {
    profile = await api.getProfile();
  }

  /// Re-fetches the profile (e.g. after a self-service edit) and notifies
  /// listeners so the greeting updates. Best effort; ignores transient errors.
  Future<void> refreshProfile() async {
    try {
      await _loadProfile();
      notifyListeners();
    } catch (_) {
      // Keep the existing profile if the refresh fails.
    }
  }

  Future<void> _saveTokens(
    String? access,
    String? refresh,
    DateTime? expiry,
  ) async {
    _accessToken = access;
    _refreshToken = refresh;
    _expiry = expiry;
    if (access != null) {
      await _storage.write(key: 'access_token', value: access);
    }
    if (refresh != null) {
      await _storage.write(key: 'refresh_token', value: refresh);
    }
    if (expiry != null) {
      await _storage.write(key: 'expiry', value: expiry.toIso8601String());
    }
  }
}
