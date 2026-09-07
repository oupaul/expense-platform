// 誰能看一張申請單的完整明細(欄位、金額、簽核紀錄、附件)——applications.ts 的 GET /:id
// 跟 attachments.ts 的 GET /:attachmentId 都要套用同一套規則，抽出來共用，避免兩邊各自
// 維護一份邏輯，之後改規則忘了改到另一邊。
export interface ApplicationAccessCheck {
  status: string;
  applicantId: string;
  approvalRecords: { status: string; stage: { roleKey: string; stageOrder: number } }[];
}

export interface ApplicationAccessAuth {
  userId: string;
  role: string;
  canViewAllReports: boolean;
}

export function canViewApplication(application: ApplicationAccessCheck, auth: ApplicationAccessAuth): boolean {
  const isOwner = application.applicantId === auth.userId;
  const isAdmin = auth.role === "admin";

  // 草稿是使用者還沒寫完、還沒送出的內容，只有申請人自己或 admin 能看，
  // 不套用下面「同公司都能看」那套更寬鬆的規則(簽核者/canViewAllReports 都不能看草稿)。
  if (application.status === "draft") {
    return isOwner || isAdmin;
  }

  // 申請單建立時，所有關卡的 ApprovalRecord 是「同時」一起建立成 status:"waiting"
  // 的(不是簽核到哪一關才建立那一關)，所以不能只看 status==="waiting" 就當作「輪到我」——
  // 例如三關 dept_manager/finance/gm 的申請單剛送出時，三筆都是 waiting，finance/gm
  // 這時候都還沒輪到，卻會被誤判成「目前的簽核者」。真正「目前」是按 stageOrder 排序後、
  // 第一筆還是 waiting 的那一關(跟 /:id/decision 路由判斷「目前該誰簽」用的是同一個邏輯)。
  const currentRecord = [...application.approvalRecords]
    .sort((a, b) => a.stage.stageOrder - b.stage.stageOrder)
    .find((r) => r.status === "waiting");

  // 一般申請人不能看到別人的申請單明細——只有申請人本人、admin、被指定 canViewAllReports
  // 的人，或「目前輪到這個角色簽核」的簽核者可以看。approver 限定「目前」是因為
  // PendingApprovals 的「查看明細並簽核」一定要先看得到完整內容才能決定核准/駁回/退回，
  // 一旦這一關輪過去，這個角色就不再是「目前的簽核者」，也就不再需要(也不該)繼續看到。
  const isCurrentApprover = currentRecord?.stage.roleKey === auth.role;
  return isOwner || isAdmin || auth.canViewAllReports || isCurrentApprover;
}
