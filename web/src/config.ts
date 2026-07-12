// Runtime config with dev defaults; override via Vite env vars if needed.
export const config = {
  apiBase: import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api/v1',
  oidc: {
    authority:
      import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/example',
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'hris-web',
  },
};
