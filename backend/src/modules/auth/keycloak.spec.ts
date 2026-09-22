import { UnauthorizedException } from '@nestjs/common';
import { assertAccessToken, KeycloakClaims } from './keycloak.service';

// A realm signs more than the access tokens this API should accept: ID tokens
// and tokens for other clients carry the same issuer and a valid signature, so
// the claim check is what separates a credential from a token that merely came
// from the right place. Shapes here match what the oasis realm actually emits.

function claims(overrides: Partial<KeycloakClaims> = {}): KeycloakClaims {
  return { typ: 'Bearer', azp: 'hris-mobile', ...overrides };
}

describe('assertAccessToken', () => {
  it('accepts an access token from either client', () => {
    expect(() => assertAccessToken(claims())).not.toThrow();
    expect(() => assertAccessToken(claims({ azp: 'hris-web' }))).not.toThrow();
  });

  it('accepts the shape Keycloak emits for a public client, aud "account"', () => {
    expect(() =>
      assertAccessToken(claims({ aud: 'account' })),
    ).not.toThrow();
  });

  it('rejects an ID token, which shares the issuer and signature', () => {
    // What the realm returns alongside the access token when scope=openid.
    expect(() =>
      assertAccessToken({ typ: 'ID', azp: 'hris-mobile', aud: 'hris-mobile' }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      assertAccessToken({ typ: 'ID', azp: 'hris-mobile', aud: 'hris-mobile' }),
    ).toThrow('An access token is required');
  });

  it('rejects a refresh token or any other token type', () => {
    expect(() => assertAccessToken(claims({ typ: 'Refresh' }))).toThrow(
      UnauthorizedException,
    );
    expect(() => assertAccessToken(claims({ typ: undefined }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token minted for a different client in the same realm', () => {
    expect(() => assertAccessToken(claims({ azp: 'some-other-client' }))).toThrow(
      'Token was not issued for this application.',
    );
    expect(() =>
      assertAccessToken({ typ: 'Bearer', azp: 'attacker', aud: 'account' }),
    ).toThrow(UnauthorizedException);
  });

  it('falls back to aud when the realm omits azp', () => {
    expect(() =>
      assertAccessToken({ typ: 'Bearer', aud: 'hris-web' }),
    ).not.toThrow();
    expect(() =>
      assertAccessToken({ typ: 'Bearer', aud: ['account', 'hris-mobile'] }),
    ).not.toThrow();
    expect(() => assertAccessToken({ typ: 'Bearer', aud: ['account'] })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token that names no client at all', () => {
    expect(() => assertAccessToken({ typ: 'Bearer' })).toThrow(
      UnauthorizedException,
    );
  });
});
