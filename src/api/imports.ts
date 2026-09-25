import { ColumnMapping, ImportJob } from '../types';
import { apiClient, ApiResponse } from './client';

export interface ImportUploadResponse {
  importId: string;
  filename: string;
  fileType: 'CSV' | 'PDF';
  status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING';
}

export interface ImportValidationResponse {
  status: 'VALIDATED';
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  eligibleRecords: number;
  ineligibleRecords: number;
  errors: Array<{ row: number; codes: string[] }>;
}

export interface ImportConfirmResponse {
  importId: string;
  status: 'IMPORTED';
  participantsCreated: number;
  certificateRequestsCreated: number;
}

export const importsService = {
  uploadAttendance(file: File): Promise<ApiResponse<ImportUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient<ImportUploadResponse>('/imports', { method: 'POST', body: formData });
  },

  getImportStatus(importId: string): Promise<ApiResponse<ImportJob>> {
    return apiClient<ImportJob>(`/imports/${importId}`);
  },

  getImportPreview(importId: string): Promise<ApiResponse<{ columns: string[]; records: Record<string, string>[] }>> {
    return apiClient(`/imports/${importId}/preview`);
  },

  submitMapping(importId: string, mapping: Record<string, string>) {
    return apiClient<{ importId: string; status: string; mapping: Record<string, string> }>(
      `/imports/${importId}/mapping`,
      { method: 'POST', body: JSON.stringify({ mapping }) },
    );
  },

  validateImport(importId: string, mapping: ColumnMapping[]): Promise<ApiResponse<ImportValidationResponse>> {
    return apiClient(`/imports/${importId}/validate`, {
      method: 'POST',
      body: JSON.stringify({
        mapping: mapping.reduce<Record<string, string>>((acc, item) => {
          if (item.mappedField !== 'ignore') acc[item.mappedField] = item.detectedColumn;
          return acc;
        }, {}),
      }),
    });
  },

  confirmImport(importId: string, importValidRecordsOnly = true): Promise<ApiResponse<ImportConfirmResponse>> {
    return apiClient(`/imports/${importId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ importValidRecordsOnly }),
    });
  },

  analyzeFile(file: File | string, _onProgress?: (progress: number) => void) {
    if (typeof file === 'string') return apiClient(`/imports/${file}`);
    return this.uploadAttendance(file);
  },

  commitImport(importId: string) {
    return this.confirmImport(importId);
  },
};
