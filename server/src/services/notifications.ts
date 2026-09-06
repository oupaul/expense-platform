import { prisma } from "../db.js";
import { sendMail } from "./mailer.js";

// 站內通知(DB 那份，鈴鐺清單用)跟 email 共用同一個觸發點、同一段文字——先寫進 DB
// (快、不太可能失敗)，email 用 Promise.allSettled 各自獨立寄，某個人的信箱寄失敗
// 不影響其他收件人，也不影響站內通知已經寫入成功這件事。
async function notify(params: {
  companyId: string;
  applicationId: string;
  type: "submitted" | "approved" | "rejected" | "returned";
  title: string;
  message: string;
  recipients: { id: string; email: string }[];
}) {
  const { companyId, applicationId, type, title, message, recipients } = params;
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((r) => ({ companyId, userId: r.id, applicationId, type, title, message })),
  });

  await Promise.allSettled(recipients.map((r) => sendMail({ to: r.email, subject: title, text: message })));
}

// 某個簽核關卡的角色(roleKey)在這家公司裡實際對應到的使用者——可能不只一人
// (例如兩個人都是 finance)，也可能剛好一個都沒有(角色設定了但還沒指派人)，
// 後者呼叫端會拿到空陣列，notify() 看到空陣列就直接跳過，不是錯誤。
async function findStageApprovers(companyId: string, roleKey: string) {
  return prisma.user.findMany({
    where: { companyId, role: roleKey, active: true },
    select: { id: true, email: true },
  });
}

function formatTWD(amount: number): string {
  return `NT$${Math.round(amount).toLocaleString("zh-TW")}`;
}

// 申請單送出(直接建立、草稿送出、退回後重新送出都算)時呼叫，通知第一關的簽核者。
export async function notifySubmission(application: { id: string; companyId: string; totalAmountTWD: number }) {
  const firstStage = await prisma.approvalStage.findFirst({
    where: { companyId: application.companyId, active: true },
    orderBy: { stageOrder: "asc" },
  });
  if (!firstStage) return;

  const recipients = await findStageApprovers(application.companyId, firstStage.roleKey);
  await notify({
    companyId: application.companyId,
    applicationId: application.id,
    type: "submitted",
    title: "有新的申請單待你簽核",
    message: `有一張金額 ${formatTWD(application.totalAmountTWD)} 的費用申請單送到「${firstStage.label}」關卡，請登入系統查看並完成簽核。`,
    recipients,
  });
}

// 每一次簽核動作(核准/駁回/退回)之後呼叫。核准且還沒到最後一關時通知下一關的簽核者，
// 其餘情況(核准且是最後一關/駁回/退回)都是通知申請人本人。
export async function notifyDecision(params: {
  application: { id: string; companyId: string; applicantId: string; totalAmountTWD: number };
  action: "approve" | "reject" | "return";
  isLastStage: boolean;
  currentStageLabel: string;
  nextStageRoleKey?: string;
  nextStageLabel?: string;
  comment?: string;
}) {
  const { application, action, isLastStage, currentStageLabel, nextStageRoleKey, nextStageLabel, comment } = params;
  const amount = formatTWD(application.totalAmountTWD);

  if (action === "approve" && !isLastStage && nextStageRoleKey) {
    const recipients = await findStageApprovers(application.companyId, nextStageRoleKey);
    await notify({
      companyId: application.companyId,
      applicationId: application.id,
      type: "submitted",
      title: "有新的申請單待你簽核",
      message: `一張金額 ${amount} 的費用申請單已通過「${currentStageLabel}」，送到「${nextStageLabel ?? "下一關"}」，請登入系統查看並完成簽核。`,
      recipients,
    });
    return;
  }

  const applicant = await prisma.user.findUnique({ where: { id: application.applicantId }, select: { id: true, email: true } });
  if (!applicant) return;

  if (action === "approve") {
    await notify({
      companyId: application.companyId,
      applicationId: application.id,
      type: "approved",
      title: "你的申請已核准",
      message: `你送出的費用申請單(金額 ${amount})已完成全部簽核，核准通過。`,
      recipients: [applicant],
    });
  } else if (action === "reject") {
    await notify({
      companyId: application.companyId,
      applicationId: application.id,
      type: "rejected",
      title: "你的申請已被駁回",
      message: `你送出的費用申請單(金額 ${amount})在「${currentStageLabel}」被駁回。${comment ? `備註：${comment}` : ""}`,
      recipients: [applicant],
    });
  } else {
    await notify({
      companyId: application.companyId,
      applicationId: application.id,
      type: "returned",
      title: "你的申請被退回，請修改後重新送出",
      message: `你送出的費用申請單(金額 ${amount})在「${currentStageLabel}」被退回。備註：${comment ?? ""}`,
      recipients: [applicant],
    });
  }
}
