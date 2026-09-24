import { ComponentType } from 'react';
import { Analytics } from './pages/Analytics';
import { Approvals } from './pages/Approvals';
import { Config } from './pages/Config';
import { Documents } from './pages/Documents';
import { Employees } from './pages/Employees';
import { Geofences } from './pages/Geofences';
import { Inbox } from './pages/Inbox';
import { Learning } from './pages/Learning';
import { Leave } from './pages/Leave';
import { Lifecycle } from './pages/Lifecycle';
import { Payroll } from './pages/Payroll';
import { Performance } from './pages/Performance';
import { Recruitment } from './pages/Recruitment';
import { Reports } from './pages/Reports';
import { Review } from './pages/Review';
import { Shifts } from './pages/Shifts';
import { Team } from './pages/Team';

export interface NavEntry {
  path: string;
  label: string;
  // The permission this page's own API routes require. Left out where any
  // authenticated caller may open the page: approvals and the inbox are scoped
  // to the signed-in user, and the team views to their own reports.
  permission?: string;
  page: ComponentType<{ token: string }>;
}

// The console's pages, in sidebar order. Each permission here matches what the
// controller behind the page actually demands, so a tab appears only when its
// content would load.
export const NAV: NavEntry[] = [
  { path: 'approvals', label: 'Approvals', page: Approvals },
  {
    path: 'review',
    label: 'Review',
    permission: 'attendance:review',
    page: Review,
  },
  { path: 'inbox', label: 'Inbox', page: Inbox },
  { path: 'team', label: 'Team', page: Team },
  {
    path: 'employees',
    label: 'Employees',
    permission: 'employee:read',
    page: Employees,
  },
  {
    path: 'lifecycle',
    label: 'Lifecycle',
    permission: 'org:read',
    page: Lifecycle,
  },
  {
    path: 'geofences',
    label: 'Geofences',
    permission: 'entity:read',
    page: Geofences,
  },
  { path: 'leave', label: 'Leave', permission: 'leave:manage', page: Leave },
  { path: 'shifts', label: 'Shifts', permission: 'entity:read', page: Shifts },
  {
    path: 'payroll',
    label: 'Payroll',
    permission: 'payroll:read',
    page: Payroll,
  },
  {
    path: 'recruitment',
    label: 'Recruitment',
    permission: 'recruitment:read',
    page: Recruitment,
  },
  {
    path: 'performance',
    label: 'Performance',
    permission: 'performance:read',
    page: Performance,
  },
  {
    path: 'learning',
    label: 'Learning',
    permission: 'learning:read',
    page: Learning,
  },
  {
    path: 'documents',
    label: 'Documents',
    permission: 'document:read',
    page: Documents,
  },
  {
    path: 'analytics',
    label: 'Analytics',
    permission: 'analytics:read',
    page: Analytics,
  },
  {
    path: 'reports',
    label: 'Reports',
    permission: 'analytics:read',
    page: Reports,
  },
  {
    path: 'config',
    label: 'Config',
    permission: 'attendance:config',
    page: Config,
  },
];
