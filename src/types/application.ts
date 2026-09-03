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
