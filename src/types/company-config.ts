// 對應 GET /api/companies/:id/config 的回傳形狀
// 前端只需要這一支 API，就能拿到渲染整張表單所需的所有資訊。

export interface OptionalFields {
  projectCode: boolean;
  invoiceDate: boolean;
  payeeInfo: boolean;
  requestedPaymentDate: boolean;
}

export interface Branding {
  name: string;
  nameEn?: string;
  logoUrl?: string;
  appUrl?: string;
  primaryColor: string;
  headerBgColor: string;
  gradientFrom: string;
  gradientTo: string;
}

export interface SelectOption {
  id: string;
  name: string;
}

export interface ApprovalStageConfig {
  id: string;
  stageOrder: number;
  roleKey: string;
  label: string;
}

export interface ExchangeRateConfig {
  currency: string;
  rateToTWD: string;
}

export interface ExpenseCategoryOption extends SelectOption {
  requiresProjectCode: boolean;
}

export interface CompanyFormConfig {
  companyId: string;
  branding: Branding;
  multiCurrencyEnabled: boolean;
  optionalFields: OptionalFields;
  printRowsPerPage: number;
  appNumberEnabled: boolean;
  appNumberPrefix: string;
  appNumberDateFormat: "none" | "roc" | "yyyyMMdd" | "yyMMdd";
  appNumberResetPeriod: "daily" | "monthly" | "yearly" | "never";
  appNumberSeqDigits: number;
  // Tenant/Client ID 不是密鑰，登入頁要用這兩個值組 Microsoft 登入網址(MSAL.js)，
  // 沒有啟用或還沒設定完整時 tenantId/clientId 可能是 undefined。
  m365Enabled: boolean;
  m365TenantId?: string;
  m365ClientId?: string;
  departments: SelectOption[];
  expenseNatures: SelectOption[];
  expenseCategories: ExpenseCategoryOption[];
  approvalStages: ApprovalStageConfig[];
  exchangeRates: ExchangeRateConfig[];
}
