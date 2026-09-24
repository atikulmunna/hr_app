// Mirrors the API's own rule (backend permissions.ts) so the console hides what
// the server would refuse. This is presentation only: every route is still
// checked server-side, and a caller who forges a permission here gains nothing.
export function hasPermission(
  permissions: string[],
  required: string,
): boolean {
  return permissions.includes('*') || permissions.includes(required);
}
