import { request } from './client';
import {
  Application,
  ApplicationSource,
  CreateRequisitionInput,
  Offer,
  PipelineStage,
  Recommendation,
  Requisition,
} from './types';

// Requisitions, candidates, interviews and offers.
export const recruitment = {
  recruitmentStages: (token: string) =>
    request<PipelineStage[]>(token, '/recruitment/stages'),
  requisitions: (token: string) =>
    request<Requisition[]>(token, '/recruitment/requisitions'),
  requisition: (token: string, id: string) =>
    request<Requisition>(token, `/recruitment/requisitions/${id}`),
  createRequisition: (token: string, body: CreateRequisitionInput) =>
    request<Requisition>(token, '/recruitment/requisitions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitRequisition: (token: string, id: string) =>
    request<Requisition>(token, `/recruitment/requisitions/${id}/submit`, {
      method: 'POST',
    }),
  closeRequisition: (token: string, id: string) =>
    request<Requisition>(token, `/recruitment/requisitions/${id}/close`, {
      method: 'POST',
    }),
  applications: (token: string, requisitionId: string) =>
    request<Application[]>(
      token,
      `/recruitment/applications?requisitionId=${requisitionId}`,
    ),
  application: (token: string, id: string) =>
    request<Application>(token, `/recruitment/applications/${id}`),
  createApplication: (
    token: string,
    body: {
      requisitionId: string;
      candidateName: string;
      candidateEmail: string;
      candidatePhone?: string;
      source: ApplicationSource;
      referralEmployeeId?: string | null;
    },
  ) =>
    request<Application>(token, '/recruitment/applications', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  moveApplication: (token: string, id: string, stageId: string) =>
    request<Application>(token, `/recruitment/applications/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ stageId }),
    }),
  rejectApplication: (token: string, id: string) =>
    request<Application>(token, `/recruitment/applications/${id}/reject`, {
      method: 'POST',
    }),
  scheduleInterview: (
    token: string,
    id: string,
    body: {
      scheduledAt: string;
      mode: string;
      interviewerName?: string;
    },
  ) =>
    request<Application>(token, `/recruitment/applications/${id}/interviews`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  addScorecard: (
    token: string,
    interviewId: string,
    body: { rating: number; recommendation: Recommendation; comments?: string },
  ) =>
    request<Application>(
      token,
      `/recruitment/interviews/${interviewId}/scorecards`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  offer: (token: string, applicationId: string) =>
    request<Offer | null>(
      token,
      `/recruitment/applications/${applicationId}/offer`,
    ),
  createOffer: (
    token: string,
    applicationId: string,
    body: { salaryAmount: number; currencyCode?: string; startDate: string },
  ) =>
    request<Offer>(token, `/recruitment/applications/${applicationId}/offer`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  signOffer: (token: string, id: string, signerName: string) =>
    request<Offer>(token, `/recruitment/offers/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ signerName }),
    }),
  declineOffer: (token: string, id: string) =>
    request<Offer>(token, `/recruitment/offers/${id}/decline`, {
      method: 'POST',
    }),
  convertOffer: (token: string, id: string) =>
    request<{ employeeId: string }>(
      token,
      `/recruitment/offers/${id}/convert`,
      { method: 'POST' },
    ),

  // --- Performance management (T-3.2).
};
