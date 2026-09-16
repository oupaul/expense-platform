export interface OptionItem {
  id: string;
  companyId: string;
  name: string;
  sortOrder: number;
  active: boolean;
  requiresProjectCode?: boolean;
}

export interface CustomFieldItem {
  id: string;
  companyId: string;
  name: string;
  fieldType: "text" | "date" | "select";
  // 同一個群組名稱的欄位彼此互斥(同一列最多只能填一個)，null/undefined 代表獨立欄位。
  exclusiveGroup: string | null;
  sortOrder: number;
  active: boolean;
}

export interface CustomFieldOptionItem {
  id: string;
  customFieldId: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

export interface CategoryCustomFieldLinkItem {
  customFieldId: string;
  required: boolean;
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
