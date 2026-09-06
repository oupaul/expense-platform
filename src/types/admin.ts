export interface OptionItem {
  id: string;
  companyId: string;
  name: string;
  sortOrder: number;
  active: boolean;
  requiresProjectCode?: boolean;
}

export interface ApprovalStageItem {
  id: string;
  companyId: string;
  stageOrder: number;
  roleKey: string;
  label: string;
  active: boolean;
}

export interface ReportSummary {
  range: { from: string; to: string };
  byDepartment: { departmentId: string; name: string; totalTWD: number; count: number }[];
  byCategory: { categoryId: string; name: string; totalTWD: number; count: number }[];
  byStatus: { status: string; totalTWD: number; count: number }[];
  monthlyTrend: { month: string; totalTWD: number }[];
}
