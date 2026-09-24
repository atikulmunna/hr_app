import { request } from './client';
import {
  Appraisal,
  CalibrationView,
  CreateCycleInput,
  Goal,
  GoalStatus,
  OutcomeInput,
  ReviewCycle,
} from './types';

// Review cycles, goals, appraisals and outcomes.
export const performance = {
  reviewCycles: (token: string) =>
    request<ReviewCycle[]>(token, '/performance/cycles'),
  createCycle: (token: string, body: CreateCycleInput) =>
    request<ReviewCycle>(token, '/performance/cycles', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  activateCycle: (token: string, id: string) =>
    request<ReviewCycle>(token, `/performance/cycles/${id}/activate`, {
      method: 'POST',
    }),
  moveCycleToCalibration: (token: string, id: string) =>
    request<ReviewCycle>(token, `/performance/cycles/${id}/calibration`, {
      method: 'POST',
    }),
  closeCycle: (token: string, id: string) =>
    request<ReviewCycle>(token, `/performance/cycles/${id}/close`, {
      method: 'POST',
    }),
  calibrationBoard: (token: string, id: string) =>
    request<CalibrationView>(token, `/performance/cycles/${id}/calibration`),
  cycleAppraisals: (token: string, cycleId: string) =>
    request<Appraisal[]>(token, `/performance/appraisals?cycleId=${cycleId}`),
  appraisal: (token: string, id: string) =>
    request<Appraisal>(token, `/performance/appraisals/${id}`),
  calibrateAppraisal: (token: string, id: string, finalRating: number) =>
    request<Appraisal>(token, `/performance/appraisals/${id}/calibrate`, {
      method: 'POST',
      body: JSON.stringify({ finalRating }),
    }),
  setOutcome: (token: string, id: string, body: OutcomeInput) =>
    request<Appraisal>(token, `/performance/appraisals/${id}/outcome`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  applyOutcome: (token: string, id: string) =>
    request<Appraisal>(token, `/performance/appraisals/${id}/outcome/apply`, {
      method: 'POST',
    }),
  employeeGoals: (token: string, employeeId: string) =>
    request<Goal[]>(token, `/performance/goals?employeeId=${employeeId}`),
  createGoal: (
    token: string,
    body: {
      employeeId: string;
      cycleId?: string | null;
      parentGoalId?: string | null;
      title: string;
      description?: string;
      weight?: number | null;
    },
  ) =>
    request<Goal>(token, '/performance/goals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateGoal: (
    token: string,
    id: string,
    body: { progress?: number; status?: GoalStatus },
  ) =>
    request<Goal>(token, `/performance/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // --- Learning and development (T-3.3).
};
