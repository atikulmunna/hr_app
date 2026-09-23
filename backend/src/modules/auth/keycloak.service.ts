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
  // Keycloak stamps "Bearer" on an access token and "ID" on an ID token.
  typ?: string;
  // The client the token was issued to (authorized party).
  azp?: string;
}

// The clients of this application. Realm-per-tenant means every tenant realm
// defines the same two public clients (see infra/keycloak/realms).
const ACCEPTED_CLIENTS = ['hris-web', 'hris-mobile'];

// A valid signature and a trusted issuer are not enough: the realm also issues
// ID tokens, and tokens for other clients, which share both. This rejects
// anything that is not an access token minted for this application.
export function assertAccessToken(claims: KeycloakClaims): void {
  // An ID token is issued to the client to describe the user, not to call an
  // API with. It is handled more loosely than an access token, so accepting one
  // here would widen what counts as a credential.
  if (claims.typ !== 'Bearer') {
    throw new UnauthorizedException(
      'An access token is required; this is not one.',
    );
  }
  // azp names the client the token was issued to. aud only carries a client
  // when the realm adds an audience mapper, so both are considered.
  const audience =
    typeof claims.aud === 'string' ? [claims.aud] : (claims.aud ?? []);
  const parties = [claims.azp, ...audience];
  if (!parties.some((party) => party && ACCEPTED_CLIENTS.includes(party))) {
    throw new UnauthorizedException(
      'Token was not issued for this application.',
    );
  }
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

  async verify(
    token: string,
  ): Promise<{ realm: string; claims: KeycloakClaims }> {
    let iss: string;
    try {
      iss = decodeJwt(token).iss ?? '';
    } catch {
      throw new UnauthorizedException('Malformed token.');
    }
    const realm = this.realmFromIssuer(iss);
    let claims: KeycloakClaims;
    try {
      const { payload } = await jwtVerify(token, this.jwks(realm), {
        issuer: iss,
      });
      claims = payload as KeycloakClaims;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
    // Outside the catch: these rejections are specific, and folding them into
    // it would report them as an invalid signature.
    assertAccessToken(claims);
    return { realm, claims };
  }
}
