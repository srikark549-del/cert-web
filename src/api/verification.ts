import { apiClient, ApiResponse } from './client';
import { store } from './store';

export interface VerifiedCertificateData {
  valid: boolean;
  isValid: boolean;
  status: 'VALID' | 'NOT_FOUND';
  certificateId: string;
  name: string;
  recipientName: string;
  eventName: string;
  organization: string;
  issuedAt: string;
  issueDate: string;
}

/**
 * Public Verification API (Section 31 & 45)
 * GET /public/certificates/:certificateId/verify
 */
export const verificationService = {
  async verifyCertificate(certificateId: string): Promise<ApiResponse<VerifiedCertificateData>> {
    const cleanId = certificateId.trim().toUpperCase();

    try {
      const res = await apiClient<VerifiedCertificateData>(`/public/certificates/${cleanId}/verify`);
      if (res.data) return res;
    } catch {
      // Offline fallback
    }

    const certs = store.getCertificates();
    const cert = certs.find((c) => c.certificateId.toUpperCase() === cleanId);
    const settings = store.getSettings();

    // Must be GENERATED or SENT to be valid public credential
    if (!cert || (cert.status !== 'GENERATED' && cert.status !== 'SENT')) {
      return {
        success: true,
        data: {
          valid: false,
          isValid: false,
          status: 'NOT_FOUND',
          certificateId: cleanId,
          name: '',
          recipientName: '',
          eventName: settings.eventName,
          organization: settings.organizationName,
          issuedAt: '',
          issueDate: '',
        },
      };
    }

    const issueDateStr = cert.issueDate || cert.generatedAt || cert.approvedAt || 'September 24, 2026';

    return {
      success: true,
      data: {
        valid: true,
        isValid: true,
        status: 'VALID',
        certificateId: cert.certificateId,
        name: cert.participantName,
        recipientName: cert.participantName,
        eventName: cert.eventName || settings.eventName,
        organization: settings.organizationName,
        issuedAt: issueDateStr,
        issueDate: issueDateStr,
      },
    };
  },
};
