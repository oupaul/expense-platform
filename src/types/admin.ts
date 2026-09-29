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
  // 樞紐表欄位用的月份清單，跟 monthlyTrend 同一組(區間內有已核准申請單的月份)。
  months: string[];
  // 每列是「申請人 + 費用性質」的組合(同一人可能有好幾列，各是不同費用性質)，
  // 已依申請人整體總額(高到低)、再依費用性質名稱排序。
  byApplicantMonthly: {
    applicantId: string;
    name: string;
    expenseNatureId: string | null;
    expenseNatureName: string;
    monthlyTotals: Record<string, number>;
    totalTWD: number;
  }[];
}

// 租戶自己的寄信設定——跟 src/types/platform.ts 的 NotificationConfig 形狀一樣，
// 只多一個 usingPlatformDefault：這家公司目前有沒有真的在用自己的設定，還是
// 退回平台層級的預設值(多數租戶一開始都是這個狀態)。
export interface CompanyNotificationConfig {
  authMethod: "smtp" | "m365_oauth2";
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
  usingPlatformDefault: boolean;
}
