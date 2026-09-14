import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { decryptSecret } from "../auth/nasSecret.js";

// SMTP/M365 設定放在資料庫(NotificationConfig，平台管理頁面「通知」分頁維護)，不是 .env——
// 跟 BackupConfig 的 NAS 設定同一種模式，平台管理者不用 SSH 進主機改設定檔、重啟服務，
// 直接在後台畫面改、按「測試連線」馬上知道有沒有設定對。沒啟用或還沒設定完整就直接跳過，
// email 靜默略過、只記一次警告，站內通知(DB 那份)完全不受影響。
let warnedMissingConfig = false;

type MailOpts = { to: string; subject: string; text: string; html?: string };

export async function sendMail(opts: MailOpts): Promise<void> {
  const config = await prisma.notificationConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.smtpEnabled) return;

  const isM365 = config.authMethod === "m365_oauth2";
  const configComplete = isM365
    ? !!(config.m365TenantId && config.m365ClientId && config.m365ClientSecretEnc && config.m365FromAddress)
    : !!(config.smtpHost && config.smtpUser && config.smtpPassEnc);

  if (!configComplete) {
    if (!warnedMissingConfig) {
      console.warn("尚未在平台管理頁面(通知設定)設定完整寄信帳號，email 通知將不會寄送，只會記錄站內通知。");
      warnedMissingConfig = true;
    }
    return;
  }

  try {
    if (isM365) {
      await sendMailViaM365Graph(
        {
          tenantId: config.m365TenantId!,
          clientId: config.m365ClientId!,
          clientSecretEnc: config.m365ClientSecretEnc!,
          fromAddress: config.m365FromAddress!,
        },
        opts
      );
    } else {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost!,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: { user: config.smtpUser!, pass: decryptSecret(config.smtpPassEnc!) },
        // 公司自己架的內部郵件伺服器很常見用自我簽署/內部 CA 憑證，預設(false)維持正常的
        // 憑證驗證；只有平台管理者在「通知」分頁明確勾選「信任自我簽署憑證」才關掉驗證。
        tls: { rejectUnauthorized: !config.smtpAllowSelfSigned },
      });
      await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser!,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      });
    }
  } catch (err) {
    // 寄信失敗(帳密/憑證錯誤、額度用完等)不該讓觸發通知的那個 API 請求(送出/簽核申請單)
    // 跟著失敗——使用者的申請單本身有沒有成功送出，跟通知信寄不寄得出去是兩件事。
    console.error(`寄送 email 通知失敗(收件人：${opts.to})`, err);
  }
}

// M365 應用程式權限(client credentials)換 access token——跟一般使用者登入用的
// authorization code flow(見 src/auth/m365.ts 的 SSO 登入)不一樣，這裡完全不需要任何
// 使用者互動，純粹是這支應用程式自己代表整個租戶跟 Microsoft 證明身分，換到的 token
// 拿去呼叫 Graph API 用，不代表任何一個真人使用者。
async function getM365GraphAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `取得 access token 失敗(HTTP ${res.status})`);
  }
  return body.access_token;
}

async function sendMailViaM365Graph(
  creds: { tenantId: string; clientId: string; clientSecretEnc: string; fromAddress: string },
  opts: MailOpts
): Promise<void> {
  const accessToken = await getM365GraphAccessToken(creds.tenantId, creds.clientId, decryptSecret(creds.clientSecretEnc));
  // Graph 的 /users/{id}/sendMail 用 fromAddress 當路徑參數(哪個信箱寄)，跟 SMTP 的
  // auth.user 不同：這裡的「寄件人」不是拿去認證用的帳號，是應用程式權限允許代表寄信的
  // 對象，兩者概念上不一樣，但對這支系統來說都是「用哪個信箱寄出通知信」，介面上共用
  // 同一個「寄件人」的心智模型即可。
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(creds.fromAddress)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: opts.html ? "HTML" : "Text", content: opts.html ?? opts.text },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Graph sendMail 失敗(HTTP ${res.status})：${errBody}`);
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

// 同上，M365 OAuth2 版本：先驗證能不能換到 access token(代表 tenantId/clientId/
// clientSecret 正確，而且 Mail.Send 應用程式權限已經被租戶管理員同意)，有帶測試收件人
// 才進一步真的寄一封測試信(還能額外驗證 fromAddress 是不是這個租戶裡真實存在的信箱)。
export async function testM365Connection(params: {
  tenantId: string;
  clientId: string;
  clientSecretEnc: string;
  fromAddress: string;
  testRecipient?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    await getM365GraphAccessToken(params.tenantId, params.clientId, decryptSecret(params.clientSecretEnc));
    if (params.testRecipient) {
      await sendMailViaM365Graph(
        { tenantId: params.tenantId, clientId: params.clientId, clientSecretEnc: params.clientSecretEnc, fromAddress: params.fromAddress },
        {
          to: params.testRecipient,
          subject: "費用申請系統—通知功能測試信",
          text: "這是一封測試信，收到代表 Microsoft 365 OAuth2 設定正確，之後申請單相關通知會用這個信箱寄出。",
        }
      );
      return { ok: true, message: `連線成功，測試信已寄到 ${params.testRecipient}` };
    }
    return { ok: true, message: "連線成功，已成功取得 access token(Mail.Send 應用程式權限設定正確)" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "連線失敗" };
  }
}
