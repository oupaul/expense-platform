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
  departments: SelectOption[];
  expenseNatures: SelectOption[];
  expenseCategories: ExpenseCategoryOption[];
  approvalStages: ApprovalStageConfig[];
  exchangeRates: ExchangeRateConfig[];
}
