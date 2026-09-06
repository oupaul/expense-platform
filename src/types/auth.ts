export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  companyId: string;
  companySlug: string;
  canViewAllReports: boolean;
}

export interface AuthState {
  token: string;
  user: AuthUser;
}
