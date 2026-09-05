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
