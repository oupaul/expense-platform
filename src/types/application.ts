export interface ApplicationListItem {
  id: string;
  applicantId: string;
  // 只有正式送出的申請單才會有編號(草稿/啟用編號功能前的舊資料是 null)。
  applicationNumber: string | null;
  // 草稿狀態下這幾個欄位可能還沒填，所以是 null——已經送出的申請單(pending 以後的狀態)
  // 一定有值，是 submit-draft/建立時強制檢查過的。
  applicationDate: string | null;
  purpose: string | null;
  totalAmountTWD: string;
  status: string;
  returnComment: string | null;
  returnedAt: string | null;
  returnedByStageLabel: string | null;
  applicant: { name: string };
  department: { name: string } | null;
  approvalRecords: {
    id: string;
    status: string;
    stage: { label: string; roleKey: string; stageOrder: number };
  }[];
}

export interface ApplicationItemDetail {
  id: string;
  categoryId: string;
  description: string | null;
  date: string | null;
  projectCode: string | null;
  invoiceDate: string | null;
  currency: string;
  amount: string;
  amountInTWD: string;
  category: { name: string };
  customFieldValues: Record<string, string> | null;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ApprovalRecordDetail {
  id: string;
  status: string;
  comment: string | null;
  signedAt: string | null;
  signatureImage: string | null;
  stage: { stageOrder: number; roleKey: string; label: string };
  approver: { name: string } | null;
}

export interface ApplicationDetail {
  id: string;
  applicantId: string;
  // 只有正式送出的申請單才會有編號(草稿/啟用編號功能前的舊資料是 null)。
  applicationNumber: string | null;
  // 草稿狀態下這幾個欄位可能還沒填，所以是 null——已經送出的申請單一定有值。
  departmentId: string | null;
  expenseNatureId: string | null;
  applicationDate: string | null;
  purpose: string | null;
  payeeName: string | null;
  payeeBankInfo: Record<string, string> | null;
  requestedPaymentDate: string | null;
  totalAmountTWD: string;
  status: string;
  returnComment: string | null;
  returnedAt: string | null;
  returnedByStageLabel: string | null;
  applicant: { name: string; email: string };
  department: { name: string } | null;
  expenseNature: { name: string } | null;
  applicantSignature: string | null;
  items: ApplicationItemDetail[];
  approvalRecords: ApprovalRecordDetail[];
  attachments: AttachmentMeta[];
}
