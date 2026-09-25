import {
  Participant,
  Certificate,
  CertificateTemplate,
  EmailLog,
  AuditLog,
  SystemSettings,
  AdminUser,
  AppNotification,
  DashboardStats,
  ImportJob,
} from '../types';
import { INITIAL_ADMIN, INITIAL_SETTINGS } from '../mock/data';
import JSZip from 'jszip';

const STORAGE_KEYS = {
  PARTICIPANTS: 'cf_real_participants_v2',
  CERTIFICATES: 'cf_real_certificates_v2',
  TEMPLATES: 'cf_real_templates_v2',
  EMAIL_LOGS: 'cf_real_emails_v2',
  AUDIT_LOGS: 'cf_real_audit_v2',
  SETTINGS: 'cf_real_settings_v2',
  NOTIFICATIONS: 'cf_real_notifs_v2',
  AUTH_USER: 'cf_real_admin_user_v2',
  ACTIVE_IMPORT: 'cf_active_import_job_v2',
};

class DataStore {
  private listeners: Set<() => void> = new Set();
  private notifyScheduled = false;

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    setTimeout(() => {
      this.notifyScheduled = false;
      this.listeners.forEach((l) => {
        try {
          l();
        } catch (e) {
          console.error('DataStore listener error:', e);
        }
      });
    }, 0);
  }

  getParticipants(): Participant[] {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }

  saveParticipants(data: Participant[]) {
    localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(data));
    this.notify();
  }

  getCertificates(): Certificate[] {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.CERTIFICATES);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }

  saveCertificates(data: Certificate[]) {
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(data));
    this.notify();
  }

  getTemplates(): CertificateTemplate[] {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }

  saveTemplates(data: CertificateTemplate[]) {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(data));
    this.notify();
  }

  getEmailLogs(): EmailLog[] {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.EMAIL_LOGS);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }

  saveEmailLogs(data: EmailLog[]) {
    localStorage.setItem(STORAGE_KEYS.EMAIL_LOGS, JSON.stringify(data));
    this.notify();
  }

  getAuditLogs(): AuditLog[] {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }

  saveAuditLogs(data: AuditLog[]) {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data));
    this.notify();
  }

  getSettings(): SystemSettings {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return INITIAL_SETTINGS;
  }

  saveSettings(data: SystemSettings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data));
    this.notify();
  }

  getNotifications(): AppNotification[] {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }

  saveNotifications(data: AppNotification[]) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(data));
    this.notify();
  }

  getCurrentUser(): AdminUser | null {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    // Default to configured admin session if logged in
    const token = localStorage.getItem('cf_auth_token');
    return token ? INITIAL_ADMIN : null;
  }

  saveCurrentUser(user: AdminUser | null) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    }
    this.notify();
  }

  getActiveImport(): ImportJob | null {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.ACTIVE_IMPORT);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return null;
  }

  saveActiveImport(job: ImportJob | null) {
    if (job) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_IMPORT, JSON.stringify(job));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_IMPORT);
    }
    this.notify();
  }

  getDashboardStats(): DashboardStats {
    const participants = this.getParticipants();
    const certs = this.getCertificates();

    const eligible = participants.filter((p) => p.eligibility === 'ELIGIBLE').length;
    const ineligible = participants.filter((p) => p.eligibility === 'NOT_ELIGIBLE').length;

    return {
      participants: participants.length,
      eligible,
      ineligible,
      pending: certs.filter((c) => c.status === 'PENDING').length,
      approved: certs.filter((c) => c.status === 'APPROVED').length,
      rejected: certs.filter((c) => c.status === 'REJECTED').length,
      generated: certs.filter((c) => c.status === 'GENERATED').length,
      sent: certs.filter((c) => c.status === 'SENT').length,
      failed: certs.filter((c) => c.status === 'FAILED').length,
    };
  }

  /**
   * Bulk Download Approved or Sent Certificates as a ZIP file
   * Generates a zip file containing individual printable PDF/SVG certificates
   * named with participant's name or ID.
   */
  async generateBulkZipArchive(
    certificateIds: string[]
  ): Promise<{ blob: Blob; filename: string; count: number }> {
    const certs = this.getCertificates();
    const targetCerts = certs.filter((c) => certificateIds.includes(c.id) || certificateIds.includes(c.certificateId));

    if (targetCerts.length === 0) {
      throw new Error('No matching certificates found to download.');
    }

    const zip = new JSZip();
    const settings = this.getSettings();

    for (const cert of targetCerts) {
      const sanitizedName = cert.participantName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sanitizedId = cert.certificateId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedName}_${sanitizedId}.pdf`;

      // Generate a standalone vector certificate PDF representation
      const certContent = `%PDF-1.4
%CertificateFlow Institutional Verifiable Credential
1 0 obj
<< /Title (Certificate of Completion - ${cert.participantName})
   /Author (${settings.organizationName})
   /Subject (${cert.eventName})
   /Keywords (${cert.certificateId})
   /Creator (CertificateFlow Engine)
>>
endobj
2 0 obj
<< /Type /Catalog /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages /Kids [4 0 R] /Count 1 >>
endobj
4 0 obj
<< /Type /Page /Parent 3 0 R /MediaBox [0 0 842 595] /Contents 5 0 R >>
endobj
5 0 obj
<< /Length 200 >>
stream
BT
/F1 28 Tf
200 400 Td
(${cert.participantName}) Tj
/F1 14 Tf
0 -40 Td
(For successfully completing ${cert.eventName}) Tj
0 -30 Td
(Certificate ID: ${cert.certificateId}) Tj
0 -20 Td
(Issue Date: ${cert.issueDate}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000180 00000 n 
0000000225 00000 n 
0000000280 00000 n 
0000000360 00000 n 
trailer
<< /Size 6 /Root 2 0 R /Info 1 0 R >>
startxref
580
%%EOF`;

      zip.file(filename, certContent);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().split('T')[0];
    const archiveFilename = `approved_certificates_${timestamp}.zip`;

    return {
      blob,
      filename: archiveFilename,
      count: targetCerts.length,
    };
  }

  resetToDefault() {
    this.clearAllData();
  }

  clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.PARTICIPANTS);
    localStorage.removeItem(STORAGE_KEYS.CERTIFICATES);
    localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
    localStorage.removeItem(STORAGE_KEYS.EMAIL_LOGS);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_IMPORT);
    this.notify();
  }
}

export const store = new DataStore();
