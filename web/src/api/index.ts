// The console imports `api` and the shapes from here, so splitting the
// calls into domain modules changed no page.
export * from './types';
export { ApiError } from './client';

import { auth } from './auth';
import { workflow } from './workflow';
import { team } from './team';
import { employees } from './employees';
import { shifts } from './shifts';
import { payroll } from './payroll';
import { analytics } from './analytics';
import { payrollRuns } from './payrollRuns';
import { recruitment } from './recruitment';
import { performance } from './performance';
import { learning } from './learning';
import { documents } from './documents';
import { lifecycle } from './lifecycle';

export const api = {
  ...auth,
  ...workflow,
  ...team,
  ...employees,
  ...shifts,
  ...payroll,
  ...analytics,
  ...payrollRuns,
  ...recruitment,
  ...performance,
  ...learning,
  ...documents,
  ...lifecycle,
};
