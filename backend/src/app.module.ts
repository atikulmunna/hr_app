import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { buildDataSourceOptions } from './database/typeorm.config';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConsentModule } from './modules/consent/consent.module';
import { CustomFieldModule } from './modules/custom-fields/custom-field.module';
import { DepartmentModule } from './modules/departments/department.module';
import { DeviceModule } from './modules/devices/device.module';
import { EmployeeModule } from './modules/employees/employee.module';
import { EntitiesModule } from './modules/entities/entities.module';
import { GeofenceModule } from './modules/geofences/geofence.module';
import { HealthModule } from './modules/health/health.module';
import { LeaveModule } from './modules/leave/leave.module';
import { MssModule } from './modules/mss/mss.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { OvertimeModule } from './modules/attendance/overtime.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { RegularizationModule } from './modules/attendance/regularization.module';
import { ReviewModule } from './modules/review/review.module';
import { ShiftModule } from './modules/shifts/shift.module';
import { WorkflowModule } from './modules/workflow/workflow.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(buildDataSourceOptions(true)),
    TenantModule,
    AuthModule,
    AuditModule,
    NotificationModule,
    WorkflowModule,
    HealthModule,
    EntitiesModule,
    DepartmentModule,
    CustomFieldModule,
    EmployeeModule,
    DeviceModule,
    GeofenceModule,
    ReviewModule,
    LeaveModule,
    RegularizationModule,
    ShiftModule,
    ConsentModule,
    AttendanceModule,
    MssModule,
    PrivacyModule,
    OvertimeModule,
    PayrollModule,
    AnalyticsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
