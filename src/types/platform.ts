export interface PlatformAdminUser {
  id: string;
  name: string;
  email: string;
}

export interface PlatformAuthState {
  token: string;
  admin: PlatformAdminUser;
}

export interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  active: boolean;
  createdAt: string;
  userCount: number;
  applicationCount: number;
  admins: { id: string; name: string; email: string }[];
}

export interface PlatformAdminItem {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
}

export interface BackupConfig {
  enabled: boolean;
  cronExpression: string;
  retentionDays: number;
  nasEnabled: boolean;
  nasHost: string;
  nasPort: number;
  nasUsername: string;
  nasRemotePath: string;
  hasNasPrivateKey: boolean;
  lastRunAt: string | null;
  lastRunStatus: "success" | "failed" | null;
  lastRunMessage: string | null;
}

export interface NotificationConfig {
  authMethod: "smtp" | "m365_oauth2";
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  smtpAllowSelfSigned: boolean;
  hasSmtpPass: boolean;
  m365TenantId: string;
  m365ClientId: string;
  m365FromAddress: string;
  hasM365ClientSecret: boolean;
}

export interface BackupFileItem {
  filename: string;
  size: number;
  createdAt: string;
}

export interface PlatformReportSummary {
  totalCompanies: number;
  totalUsers: number;
  totalApplications: number;
  totalAmountTWD: number;
  byCompany: {
    companyId: string;
    slug: string;
    name: string;
    userCount: number;
    applicationCount: number;
    totalAmountTWD: number;
    lastActivityAt: string | null;
  }[];
  companiesGrowth: { month: string; value: number }[];
  applicationsGrowth: { month: string; value: number }[];
}
