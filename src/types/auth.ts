export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  companyId: string;
  companySlug: string;
}

export interface AuthState {
  token: string;
  user: AuthUser;
}
