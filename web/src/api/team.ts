import { request } from './client';
import {
  AttendanceConfig,
  ConsentStatement,
  PublishConsentBody,
  TeamAttendanceRow,
  TeamLeaveRow,
  TeamMember,
} from './types';

// Manager self-service, consent and attendance configuration.
export const team = {
  team: (token: string) => request<TeamMember[]>(token, '/me/team'),
  teamAttendance: (token: string, from: string, to: string) =>
    request<TeamAttendanceRow[]>(
      token,
      `/me/team/attendance?from=${from}&to=${to}`,
    ),
  teamLeave: (token: string, from: string, to: string) =>
    request<TeamLeaveRow[]>(token, `/me/team/leave?from=${from}&to=${to}`),
  consentStatements: (token: string) =>
    request<ConsentStatement[]>(token, '/consent/statements'),
  publishConsentStatement: (token: string, body: PublishConsentBody) =>
    request<ConsentStatement>(token, '/consent/statements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  attendanceConfig: (token: string) =>
    request<AttendanceConfig>(token, '/attendance/config'),
  updateAttendanceConfig: (token: string, patch: Partial<AttendanceConfig>) =>
    request<AttendanceConfig>(token, '/attendance/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};
