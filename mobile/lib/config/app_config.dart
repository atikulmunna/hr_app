/// Runtime configuration. In dev the physical device reaches the PC's Keycloak
/// and backend over the USB bridge via `adb reverse` (localhost tunnelling).
abstract final class AppConfig {
  static const keycloakIssuer = 'http://localhost:8080/realms/oasis';
  static const discoveryUrl =
      '$keycloakIssuer/.well-known/openid-configuration';
  static const clientId = 'hris-mobile';
  static const redirectUrl = 'com.oasis.hris://auth/callback';
  static const scopes = ['openid', 'profile', 'email'];

  static const apiBase = 'http://localhost:3000/api/v1';
}
