import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { buildDataSourceOptions } from './database/typeorm.config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { EntitiesModule } from './modules/entities/entities.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildDataSourceOptions(true)),
    TenantModule,
    AuthModule,
    AuditModule,
    HealthModule,
    EntitiesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
