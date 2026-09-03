export interface ApplicationListItem {
  id: string;
  applicationDate: string;
  purpose: string | null;
  totalAmountTWD: string;
  status: string;
  applicant: { name: string };
  department: { name: string };
  approvalRecords: {
    id: string;
    status: string;
    stage: { label: string; roleKey: string; stageOrder: number };
  }[];
}

export interface ApplicationItemDetail {
  id: string;
  description: string | null;
  date: string | null;
  projectCode: string | null;
  invoiceDate: string | null;
  currency: string;
  amount: string;
  amountInTWD: string;
  category: { name: string };
}

export interface ApprovalRecordDetail {
  id: string;
  status: string;
  comment: string | null;
  signedAt: string | null;
  stage: { stageOrder: number; roleKey: string; label: string };
  approver: { name: string } | null;
}

export interface ApplicationDetail {
  id: string;
  applicationDate: string;
  purpose: string | null;
  payeeName: string | null;
  payeeBankInfo: Record<string, string> | null;
  requestedPaymentDate: string | null;
  totalAmountTWD: string;
  status: string;
  applicant: { name: string; email: string };
  department: { name: string };
  expenseNature: { name: string };
  items: ApplicationItemDetail[];
  approvalRecords: ApprovalRecordDetail[];
}
