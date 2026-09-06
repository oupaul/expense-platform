import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { decryptSecret } from "../auth/nasSecret.js";

// SMTP 設定放在資料庫(NotificationConfig，平台管理頁面「通知」分頁維護)，不是 .env——
// 跟 BackupConfig 的 NAS 設定同一種模式，平台管理者不用 SSH 進主機改設定檔、重啟服務，
// 直接在後台畫面改、按「測試連線」馬上知道有沒有設定對。沒啟用或還沒設定完整就直接跳過，
// email 靜默略過、只記一次警告，站內通知(DB 那份)完全不受影響。
let warnedMissingConfig = false;

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const config = await prisma.notificationConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.smtpEnabled || !config.smtpHost || !config.smtpUser || !config.smtpPassEnc) {
    if (!warnedMissingConfig) {
      console.warn("尚未在平台管理頁面(通知設定)啟用/設定完整 SMTP，email 通知將不會寄送，只會記錄站內通知。");
      warnedMissingConfig = true;
    }
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: decryptSecret(config.smtpPassEnc) },
      // 公司自己架的內部郵件伺服器很常見用自我簽署/內部 CA 憑證，預設(false)維持正常的
      // 憑證驗證；只有平台管理者在「通知」分頁明確勾選「信任自我簽署憑證」才關掉驗證。
      tls: { rejectUnauthorized: !config.smtpAllowSelfSigned },
    });
    await transporter.sendMail({ from: config.smtpFrom || config.smtpUser, to: opts.to, subject: opts.subject, text: opts.text });
  } catch (err) {
    // 寄信失敗(SMTP 帳密錯誤、額度用完等)不該讓觸發通知的那個 API 請求(送出/簽核申請單)
    // 跟著失敗——使用者的申請單本身有沒有成功送出，跟通知信寄不寄得出去是兩件事。
    console.error(`寄送 email 通知失敗(收件人：${opts.to})`, err);
  }
}

// 平台管理頁面「測試連線」用：帳密可能是使用者剛打在表單裡、還沒存檔的新值，
// 也可能沒帶(表示要用資料庫裡已經存的舊密碼重測)，兩種情況呼叫端都先解出一個
// passEnc 再傳進來，這支函式本身不用關心密碼是新是舊。
export async function testSmtpConnection(params: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passEnc: string;
  allowSelfSigned?: boolean;
  testRecipient?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: params.host,
      port: params.port,
      secure: params.secure,
      auth: { user: params.user, pass: decryptSecret(params.passEnc) },
      tls: { rejectUnauthorized: !params.allowSelfSigned },
    });
    await transporter.verify();
    if (params.testRecipient) {
      await transporter.sendMail({
        from: params.user,
        to: params.testRecipient,
        subject: "費用申請系統—通知功能測試信",
        text: "這是一封測試信，收到代表 SMTP 設定正確，之後申請單相關通知會用這組帳號寄出。",
      });
      return { ok: true, message: `連線成功，測試信已寄到 ${params.testRecipient}` };
    }
    return { ok: true, message: "連線成功，SMTP 帳密正確" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "連線失敗" };
  }
}
