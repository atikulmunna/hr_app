import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Restricts a route to callers holding at least one of the given realm roles.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
