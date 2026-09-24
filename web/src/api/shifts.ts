import { request } from './client';
import { CreateGeofenceBody, CreateShiftBody, Geofence, Shift } from './types';

// Shift definitions and geofences.
export const shifts = {
  shifts: (token: string) => request<Shift[]>(token, '/shifts'),
  createShift: (token: string, body: CreateShiftBody) =>
    request<Shift>(token, '/shifts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateShift: (
    token: string,
    id: string,
    patch: Partial<CreateShiftBody> & { active?: boolean },
  ) =>
    request<Shift>(token, `/shifts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  geofences: (token: string) => request<Geofence[]>(token, '/geofences'),
  createGeofence: (token: string, body: CreateGeofenceBody) =>
    request<Geofence>(token, '/geofences', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setGeofenceActive: (token: string, id: string, active: boolean) =>
    request<Geofence>(token, `/geofences/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  assignGeofence: (token: string, id: string, geofenceId: string) =>
    request<unknown>(token, `/employees/${id}/geofences`, {
      method: 'POST',
      body: JSON.stringify({ geofenceId }),
    }),
  unassignGeofence: (token: string, id: string, geofenceId: string) =>
    request<unknown>(token, `/employees/${id}/geofences/${geofenceId}`, {
      method: 'DELETE',
    }),
};
