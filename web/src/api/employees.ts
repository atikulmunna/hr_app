import { ApiError, request } from './client';
import { config } from '../config';
import {
  AbsenceRecord,
  AdminRegularizationBody,
  AttendanceSummary,
  CreateEmployeeBody,
  CreateHolidayBody,
  CreateLeaveTypeBody,
  Department,
  Device,
  DeviceHistoryEntry,
  Employee,
  ErasureResult,
  Geofence,
  Holiday,
  ImportResult,
  LeaveRequestRow,
  LeaveType,
  LegalEntity,
  Page,
  RegularizationRow,
  RosterEntry,
  Shift,
  UpdateEmployeeBody,
} from './types';

// The roster, and everything hanging off one employee.
export const employees = {
  employeesPage: (token: string, limit = 50, offset = 0) =>
    request<Page<Employee>>(
      token,
      `/employees?limit=${limit}&offset=${offset}`,
    ),
  // Every employee, fetched a page at a time. The pickers that choose an
  // employee need the full roster; walking the pages keeps them correct
  // without asking the server for an unbounded response.
  employees: async (token: string): Promise<Employee[]> => {
    const all: Employee[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await request<Page<Employee>>(
        token,
        `/employees?limit=200&offset=${offset}`,
      );
      all.push(...page.items);
      if (all.length >= page.total || page.items.length === 0) {
        return all;
      }
    }
  },
  exportEmployeesCsv: async (token: string): Promise<string> => {
    const res = await fetch(`${config.apiBase}/employees/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText);
    }
    return res.text();
  },
  importEmployeesCsv: (token: string, csv: string) =>
    request<ImportResult>(token, '/employees/import', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }),
  createEmployee: (token: string, body: CreateEmployeeBody) =>
    request<Employee>(token, '/employees', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateEmployee: (token: string, id: string, patch: UpdateEmployeeBody) =>
    request<Employee>(token, `/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  entities: (token: string) => request<LegalEntity[]>(token, '/entities'),
  departments: (token: string) => request<Department[]>(token, '/departments'),
  leaveTypes: (token: string) => request<LeaveType[]>(token, '/leave-types'),
  createLeaveType: (token: string, body: CreateLeaveTypeBody) =>
    request<LeaveType>(token, '/leave-types', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateLeaveType: (
    token: string,
    id: string,
    patch: Partial<CreateLeaveTypeBody> & { active?: boolean },
  ) =>
    request<LeaveType>(token, `/leave-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  holidays: (token: string) => request<Holiday[]>(token, '/holidays'),
  createHoliday: (token: string, body: CreateHolidayBody) =>
    request<Holiday>(token, '/holidays', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteHoliday: (token: string, id: string) =>
    request<unknown>(token, `/holidays/${id}`, { method: 'DELETE' }),
  employeeDevices: (token: string, id: string) =>
    request<Device[]>(token, `/employees/${id}/devices`),
  employeeDeviceHistory: (token: string, id: string) =>
    request<DeviceHistoryEntry[]>(token, `/employees/${id}/device-history`),
  employeeGeofences: (token: string, id: string) =>
    request<Geofence[]>(token, `/employees/${id}/geofences`),
  employeeLeaveRequests: (token: string, id: string) =>
    request<LeaveRequestRow[]>(token, `/employees/${id}/leave/requests`),
  employeeShift: (token: string, id: string) =>
    request<Shift | null>(token, `/employees/${id}/shift`),
  assignShift: (token: string, id: string, shiftId: string) =>
    request<unknown>(token, `/employees/${id}/shift`, {
      method: 'POST',
      body: JSON.stringify({ shiftId }),
    }),
  unassignShift: (token: string, id: string) =>
    request<unknown>(token, `/employees/${id}/shift`, { method: 'DELETE' }),
  employeeSummary: (token: string, id: string, from: string, to: string) =>
    request<AttendanceSummary>(
      token,
      `/employees/${id}/attendance-summary?from=${from}&to=${to}`,
    ),
  employeeAbsences: (token: string, id: string) =>
    request<AbsenceRecord[]>(token, `/employees/${id}/absences`),
  dataExport: (token: string, id: string) =>
    request<Record<string, unknown>>(token, `/employees/${id}/data-export`),
  eraseEmployee: (token: string, id: string) =>
    request<ErasureResult>(token, `/employees/${id}/erasure`, {
      method: 'POST',
    }),
  reverseAbsence: (token: string, id: string, reason?: string) =>
    request<unknown>(token, `/attendance/absences/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  employeeRegularizations: (token: string, id: string) =>
    request<RegularizationRow[]>(
      token,
      `/employees/${id}/attendance/regularizations`,
    ),
  adminRegularization: (
    token: string,
    id: string,
    body: AdminRegularizationBody,
  ) =>
    request<RegularizationRow>(
      token,
      `/employees/${id}/attendance/regularizations`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  employeeRoster: (token: string, id: string, from: string, to: string) =>
    request<RosterEntry[]>(
      token,
      `/employees/${id}/roster?from=${from}&to=${to}`,
    ),
  assignRoster: (
    token: string,
    id: string,
    body: { workDate: string; shiftId: string; note?: string },
  ) =>
    request<RosterEntry>(token, `/employees/${id}/roster`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assignRosterRange: (
    token: string,
    id: string,
    body: { from: string; to: string; shiftId: string; note?: string },
  ) =>
    request<{ assigned: number }>(token, `/employees/${id}/roster/range`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeRoster: (token: string, id: string) =>
    request<unknown>(token, `/roster/${id}`, { method: 'DELETE' }),
};
