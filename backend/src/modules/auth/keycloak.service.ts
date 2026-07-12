import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from 'jose';

export interface KeycloakClaims extends JWTPayload {
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
}

// Verifies Keycloak-issued JWTs against the issuing realm's JWKS.
// The realm is taken from the token issuer, which must sit under our trusted
// Keycloak base URL, so a token cannot point verification at an untrusted key set.
@Injectable()
export class KeycloakService {
  private readonly baseUrl = (
    process.env.KEYCLOAK_URL ?? 'http://localhost:8080'
  ).replace(/\/$/, '');
  private readonly jwksByRealm = new Map<
    string,
    ReturnType<typeof createRemoteJWKSet>
  >();

  private realmFromIssuer(iss: string): string {
    const prefix = `${this.baseUrl}/realms/`;
    if (!iss.startsWith(prefix)) {
      throw new UnauthorizedException(
        'Token issuer is not a trusted Keycloak realm.',
      );
    }
    return iss.slice(prefix.length);
  }

  private jwks(realm: string): ReturnType<typeof createRemoteJWKSet> {
    let set = this.jwksByRealm.get(realm);
    if (!set) {
      set = createRemoteJWKSet(
        new URL(
          `${this.baseUrl}/realms/${realm}/protocol/openid-connect/certs`,
        ),
      );
      this.jwksByRealm.set(realm, set);
    }
    return set;
  }

  async verify(token: string): Promise<{ realm: string; claims: KeycloakClaims }> {
    let iss: string;
    try {
      iss = decodeJwt(token).iss ?? '';
    } catch {
      throw new UnauthorizedException('Malformed token.');
    }
    const realm = this.realmFromIssuer(iss);
    try {
      const { payload } = await jwtVerify(token, this.jwks(realm), { issuer: iss });
      return { realm, claims: payload as KeycloakClaims };
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}
