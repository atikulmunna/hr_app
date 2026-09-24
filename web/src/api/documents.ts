import { request } from './client';
import {
  DocumentDetail,
  DocumentSummary,
  DocumentVisibility,
  MyDocument,
} from './types';

// The document vault and acknowledgements.
export const documents = {
  documents: (
    token: string,
    filter?: { employeeId?: string; category?: string },
  ) => {
    const params = new URLSearchParams();
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    if (filter?.category) params.set('category', filter.category);
    const q = params.toString();
    return request<DocumentSummary[]>(token, `/documents${q ? `?${q}` : ''}`);
  },
  document: (token: string, id: string) =>
    request<DocumentDetail>(token, `/documents/${id}`),
  createDocument: (
    token: string,
    body: {
      employeeId?: string | null;
      name: string;
      category?: string;
      docType?: string;
      visibility?: DocumentVisibility;
      requiresAcknowledgement?: boolean;
      sha256: string;
      note?: string;
      expiresOn?: string | null;
    },
  ) =>
    request<DocumentSummary>(token, '/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  addDocumentVersion: (
    token: string,
    id: string,
    body: { sha256: string; note?: string; expiresOn?: string | null },
  ) =>
    request<DocumentSummary>(token, `/documents/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeDocument: (token: string, id: string) =>
    request<unknown>(token, `/documents/${id}`, { method: 'DELETE' }),
  myDocuments: (token: string) => request<MyDocument[]>(token, '/me/documents'),
  acknowledgeDocument: (token: string, id: string, signerName: string) =>
    request<{ documentId: string; version: number; signedAt: string }>(
      token,
      `/me/documents/${id}/acknowledge`,
      { method: 'POST', body: JSON.stringify({ signerName }) },
    ),

  // --- Lifecycle (T-3.4b).
};
