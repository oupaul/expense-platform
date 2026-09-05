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

export interface BackupFileItem {
  filename: string;
  size: number;
  createdAt: string;
}
