import { request } from './client';
import {
  ChecklistKind,
  ChecklistSummary,
  ChecklistTemplateItem,
  ChecklistView,
  OrgNode,
  TaskView,
  TemplateItemInput,
} from './types';

// Org chart and on/offboarding checklists.
export const lifecycle = {
  orgChart: (token: string) =>
    request<{ headcount: number; roots: OrgNode[] }>(token, '/org/chart'),
  checklistTemplates: (token: string) =>
    request<Record<ChecklistKind, ChecklistTemplateItem[]>>(
      token,
      '/lifecycle/templates',
    ),
  replaceChecklistTemplate: (
    token: string,
    kind: ChecklistKind,
    items: TemplateItemInput[],
  ) =>
    request<ChecklistTemplateItem[]>(token, `/lifecycle/templates/${kind}`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  checklists: (token: string, status?: 'open' | 'complete') =>
    request<ChecklistSummary[]>(
      token,
      `/lifecycle/checklists${status ? `?status=${status}` : ''}`,
    ),
  checklist: (token: string, id: string) =>
    request<ChecklistView>(token, `/lifecycle/checklists/${id}`),
  openChecklist: (
    token: string,
    body: { employeeId: string; kind: ChecklistKind; anchorDate?: string },
  ) =>
    request<ChecklistView>(token, '/lifecycle/checklists', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  myTasks: (token: string) => request<TaskView[]>(token, '/me/tasks'),
  completeTask: (token: string, itemId: string, note?: string) =>
    request<ChecklistView>(token, `/me/tasks/${itemId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
};
