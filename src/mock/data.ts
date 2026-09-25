import {
  Participant,
  CertificateTemplate,
  Certificate,
  EmailLog,
  AuditLog,
  SystemSettings,
  AdminUser,
  AppNotification,
  DashboardStats,
} from '../types';

export const INITIAL_ADMIN: AdminUser = {
  id: 'usr_admin_01',
  name: 'Administrator',
  email: 'purnasai0718@portal.admin',
  username: 'purnasai0718',
  role: 'ADMIN',
  lastLogin: new Date().toISOString(),
};

export const INITIAL_SETTINGS: SystemSettings = {
  eventName: 'Annual Academic & Professional Certification',
  organizationName: 'Certification Secretariat',
  certificateIdPrefix: 'CERT-2026',
  issueDate: new Date().toISOString().split('T')[0],
  activeTemplateId: '',
  requireCheckIn: true,
  requireCheckOut: true,
  senderName: 'Certification Committee',
  replyToAddress: 'certificates@institution.edu',
  emailSubject: 'Your Certificate — {{EVENT_NAME}}',
  emailBodyTemplate: `Dear {{NAME}},

Congratulations! Your participation in {{EVENT_NAME}} has been verified.

Your personalized certificate has been generated and approved. Please find your official certificate attached.

Certificate ID: {{CERTIFICATE_ID}}

Regards,
Certification Secretariat`,
  mfaEnabled: true,
  sessionTimeoutMinutes: 30,
  dataEncryption: 'AES-256 (In-Transit & At-Rest)',
  backupSchedule: 'Automated Daily Snapshot',
};

// ZERO fake/placeholder records by default — strictly data-driven
export const INITIAL_PARTICIPANTS: Participant[] = [];
export const INITIAL_CERTIFICATES: Certificate[] = [];
export const INITIAL_EMAIL_LOGS: EmailLog[] = [];
export const INITIAL_TEMPLATES: CertificateTemplate[] = [];
export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
export const INITIAL_NOTIFICATIONS: AppNotification[] = [];

export const INITIAL_DASHBOARD_STATS: DashboardStats = {
  participants: 0,
  eligible: 0,
  ineligible: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  generated: 0,
  sent: 0,
  failed: 0,
};
