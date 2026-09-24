import { ApiError, request, responseMessage } from './client';
import { config } from '../config';
import {
  AbsenceAnalytics,
  AttritionAnalytics,
  CostToCompanyAnalytics,
  DeviceRebinds,
  FlagRateByTeam,
  HeadcountAnalytics,
  OvertimeAnalytics,
  Regularizations,
  RepeatSignals,
  ReportDataset,
  ReportExportFormat,
  ReportResult,
  ReportSpec,
} from './types';

// Dashboards and the report builder.
export const analytics = {
  analyticsHeadcount: (token: string) =>
    request<HeadcountAnalytics>(token, '/analytics/headcount'),
  analyticsAttrition: (token: string, months = 12) =>
    request<AttritionAnalytics>(token, `/analytics/attrition?months=${months}`),
  analyticsAbsence: (token: string, months = 12) =>
    request<AbsenceAnalytics>(token, `/analytics/absence?months=${months}`),
  analyticsOvertime: (token: string, months = 12) =>
    request<OvertimeAnalytics>(token, `/analytics/overtime?months=${months}`),
  analyticsCostToCompany: (token: string, months = 12) =>
    request<CostToCompanyAnalytics>(
      token,
      `/analytics/cost-to-company?months=${months}`,
    ),
  analyticsFlagRateByTeam: (token: string, months = 12) =>
    request<FlagRateByTeam>(
      token,
      `/analytics/flag-rate-by-team?months=${months}`,
    ),
  analyticsRepeatSignals: (token: string, months = 12) =>
    request<RepeatSignals>(token, `/analytics/repeat-signals?months=${months}`),
  analyticsDeviceRebinds: (token: string, months = 12) =>
    request<DeviceRebinds>(token, `/analytics/device-rebinds?months=${months}`),
  analyticsRegularizations: (token: string, months = 12) =>
    request<Regularizations>(
      token,
      `/analytics/regularizations?months=${months}`,
    ),
  reportDatasets: (token: string) =>
    request<ReportDataset[]>(token, '/reports/datasets'),
  runReport: (token: string, spec: ReportSpec) =>
    request<ReportResult>(token, '/reports/run', {
      method: 'POST',
      body: JSON.stringify(spec),
    }),
  exportReport: async (
    token: string,
    spec: ReportSpec,
    format: ReportExportFormat,
  ) => {
    const res = await fetch(
      `${config.apiBase}/reports/export?format=${format}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(spec),
      },
    );
    if (!res.ok) {
      throw new ApiError(res.status, await responseMessage(res));
    }
    return res.blob();
  },
};
