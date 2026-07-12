import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

// Requires the caller to hold all of the listed permissions.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
