import nodemailer, { type Transporter } from "nodemailer";

// SMTP 是選填的——很多公司一開始還沒準備好郵件伺服器，不該因為沒設定 SMTP 就讓整個
// 通知功能(包含站內鈴鐺清單)壞掉。沒設定就只記一次警告、外部呼叫端當作寄信「靜默略過」，
// 站內通知(DB 那份)完全不受影響。跟 backupScheduler 的 NAS 是選填欄位同一種設計哲學。
let transporter: Transporter | null | undefined;
let warnedMissingConfig = false;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (!warnedMissingConfig) {
      console.warn("SMTP 未設定(缺少 SMTP_HOST/SMTP_USER/SMTP_PASS)，email 通知將不會寄送，只會記錄站內通知。");
      warnedMissingConfig = true;
    }
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });
  return transporter;
}

// 給測試/重新載入設定用：SMTP 環境變數在服務啟動後才被改掉(例如手動改 .env 後沒重啟)
// 這支程式不會自動感知，但至少讓下一次呼叫可以重新嘗試建立連線，不用整個重啟進程。
export function resetMailerForTesting() {
  transporter = undefined;
  warnedMissingConfig = false;
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const t = getTransporter();
  if (!t) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await t.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text });
  } catch (err) {
    // 寄信失敗(SMTP 帳密錯誤、額度用完等)不該讓觸發通知的那個 API 請求(送出/簽核申請單)
    // 跟著失敗——使用者的申請單本身有沒有成功送出，跟通知信寄不寄得出去是兩件事。
    console.error(`寄送 email 通知失敗(收件人：${opts.to})`, err);
  }
}
