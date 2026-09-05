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
