import { CertificateStatus, EligibilityStatus, Participant } from '../types';
import { apiClient, ApiResponse } from './client';

export interface ParticipantFilterOptions {
  search?: string;
  eligibility?: EligibilityStatus | 'ALL';
  certificateStatus?: CertificateStatus | 'ALL';
  department?: string;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  totalPages: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const participantsService = {
  getParticipants(options: ParticipantFilterOptions = {}): Promise<ApiResponse<PaginatedResult<Participant>>> {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== 'ALL') params.set(key, String(value));
    });
    return apiClient(`/participants?${params.toString()}`);
  },

  getParticipantById(id: string): Promise<ApiResponse<Participant>> {
    return apiClient(`/participants/${id}`);
  },
};
