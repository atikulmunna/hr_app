import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { buildDataSourceOptions } from './database/typeorm.config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentModule } from './modules/departments/department.module';
import { EmployeeModule } from './modules/employees/employee.module';
import { EntitiesModule } from './modules/entities/entities.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildDataSourceOptions(true)),
    TenantModule,
    AuthModule,
    AuditModule,
    NotificationModule,
    WorkflowModule,
    HealthModule,
    EntitiesModule,
    DepartmentModule,
    EmployeeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
