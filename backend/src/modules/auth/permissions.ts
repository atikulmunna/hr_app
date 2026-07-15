// Granular permissions derived from realm roles (FR-M12-01).
// This mapping is static for now; it becomes tenant-configurable data later (PR-04).
export type Permission = string;

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  tenant_admin: ['*'],
  hr_admin: [
    'entity:read',
    'entity:manage',
    'audit:read',
    'org:read',
    'org:manage',
    'employee:read',
    'employee:manage',
    'attendance:review',
    'attendance:config',
    'leave:manage',
  ],
  manager: ['entity:read', 'org:read', 'employee:read'],
  recruiter: ['entity:read', 'employee:read'],
  auditor: ['entity:read', 'audit:read', 'employee:read'],
  employee: ['self:read'],
};

export function permissionsForRoles(roles: string[]): string[] {
  const perms = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) {
      perms.add(p);
    }
  }
  return Array.from(perms);
}

export function hasPermission(
  userPermissions: string[],
  required: Permission,
): boolean {
  return userPermissions.includes('*') || userPermissions.includes(required);
}
