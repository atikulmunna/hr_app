import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { KeycloakService } from './keycloak.service';
import { MeController } from './me.controller';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';
import { TenantsService } from './tenants.service';

// Global authentication. JwtAuthGuard runs first (authenticates and sets the
// tenant), then RolesGuard enforces any @Roles requirements.
@Global()
@Module({
  controllers: [MeController],
  providers: [
    KeycloakService,
    TenantsService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [KeycloakService, TenantsService],
})
export class AuthModule {}
