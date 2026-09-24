import { request } from './client';
import { Me } from './types';

// Who the caller is, as the API resolved them from the bearer token.
export const auth = {
  me: (token: string) => request<Me>(token, '/auth/me'),
};
