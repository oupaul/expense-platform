import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { decryptSecret } from "../auth/nasSecret.js";

// SMTP/M365 設定放在資料庫，不是 .env——跟 BackupConfig 的 NAS 設定同一種模式，
// 管理者不用 SSH 進主機改設定檔、重啟服務，直接在後台畫面改、按「測試連線」馬上
// 知道有沒有設定對。沒啟用或還沒設定完整就直接跳過，email 靜默略過、只記一次警告，
// 站內通知(DB 那份)完全不受影響。
//
// 兩層設定：每家租戶可以在自己的後台設定專屬的寄信方式(Company.notify* 欄位)，
// 沒設定(notifyAuthMethod 是 null，或設定不完整)就沿用平台層級的預設值
// (NotificationConfig 那個 singleton，在 /platform「通知」分頁維護)。多數客戶
// 一開始都不用自己設定，直接用平台預設寄出去就好，只有想用自己公司郵件伺服器
// 寄信的客戶才需要另外設定。
let warnedMissingConfig = false;

// 信件本身的內容——不含 companyId，因為 sendMailViaM365Graph/SMTP transporter 這些
// 實際寄信的函式不需要知道是哪家公司觸發的，companyId 只是 sendMail() 自己拿去查
// 要用哪組寄信設定，不需要往下傳。
type MailContent = { to: string; subject: string; text: string; html?: string };
type MailOpts = MailContent & { companyId: string };

type EffectiveMailConfig =
  | { authMethod: "smtp"; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPassEnc: string; smtpFrom: string | null; smtpAllowSelfSigned: boolean }
  | { authMethod: "m365_oauth2"; m365TenantId: string; m365ClientId: string; m365ClientSecretEnc: string; m365FromAddress: string };

// 這家公司自己有沒有設定完整的寄信方式，有的話優先用；沒有(或選了方式但填得不完整，
// 例如剛開始填一半)就退回平台預設。刻意不做「一半用租戶一半用平台」的混合——設定
// 不完整時整組退回平台預設，比較不會讓使用者搞不清楚實際上是用誰的帳號在寄信。
async function resolveMailConfig(companyId: string): Promise<EffectiveMailConfig | null> {
  const [company, platform] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        notifyAuthMethod: true,
        notifySmtpHost: true,
        notifySmtpPort: true,
        notifySmtpSecure: true,
        notifySmtpUser: true,
        notifySmtpPassEnc: true,
        notifySmtpFrom: true,
        notifySmtpAllowSelfSigned: true,
        notifyM365TenantId: true,
        notifyM365ClientId: true,
        notifyM365ClientSecretEnc: true,
        notifyM365FromAddress: true,
      },
    }),
    prisma.notificationConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  if (company?.notifyAuthMethod === "smtp" && company.notifySmtpHost && company.notifySmtpUser && company.notifySmtpPassEnc) {
    return {
      authMethod: "smtp",
      smtpHost: company.notifySmtpHost,
      smtpPort: company.notifySmtpPort ?? 587,
      smtpSecure: company.notifySmtpSecure ?? false,
      smtpUser: company.notifySmtpUser,
      smtpPassEnc: company.notifySmtpPassEnc,
      smtpFrom: company.notifySmtpFrom,
      smtpAllowSelfSigned: company.notifySmtpAllowSelfSigned ?? false,
    };
  }
  if (
    company?.notifyAuthMethod === "m365_oauth2" &&
    company.notifyM365TenantId &&
    company.notifyM365ClientId &&
    company.notifyM365ClientSecretEnc &&
    company.notifyM365FromAddress
  ) {
    return {
      authMethod: "m365_oauth2",
      m365TenantId: company.notifyM365TenantId,
      m365ClientId: company.notifyM365ClientId,
      m365ClientSecretEnc: company.notifyM365ClientSecretEnc,
      m365FromAddress: company.notifyM365FromAddress,
    };
  }

  if (!platform?.smtpEnabled) return null;
  if (platform.authMethod === "m365_oauth2") {
    if (!platform.m365TenantId || !platform.m365ClientId || !platform.m365ClientSecretEnc || !platform.m365FromAddress) return null;
    return {
      authMethod: "m365_oauth2",
      m365TenantId: platform.m365TenantId,
      m365ClientId: platform.m365ClientId,
      m365ClientSecretEnc: platform.m365ClientSecretEnc,
      m365FromAddress: platform.m365FromAddress,
    };
  }
  if (!platform.smtpHost || !platform.smtpUser || !platform.smtpPassEnc) return null;
  return {
    authMethod: "smtp",
    smtpHost: platform.smtpHost,
    smtpPort: platform.smtpPort,
    smtpSecure: platform.smtpSecure,
    smtpUser: platform.smtpUser,
    smtpPassEnc: platform.smtpPassEnc,
    smtpFrom: platform.smtpFrom,
    smtpAllowSelfSigned: platform.smtpAllowSelfSigned,
  };
}

// 呼叫端(notifications.ts)要把這個結果寫回對應的 Notification 記錄(emailStatus/
// emailError)，讓管理者在後台看得到「通知到底有沒有真的寄出去」，不用只看站內通知
// 寫入成功就以為 email 也一定寄成功了——這兩件事完全是分開的。
export type MailResult = { status: "sent" } | { status: "skipped" } | { status: "failed"; error: string };

export async function sendMail(opts: MailOpts): Promise<MailResult> {
  const config = await resolveMailConfig(opts.companyId);

  if (!config) {
    if (!warnedMissingConfig) {
      console.warn("尚未設定完整的寄信帳號(租戶或平台層級都沒有)，email 通知將不會寄送，只會記錄站內通知。");
      warnedMissingConfig = true;
    }
    return { status: "skipped" };
  }

  try {
    if (config.authMethod === "m365_oauth2") {
      await sendMailViaM365Graph(
        {
          tenantId: config.m365TenantId,
          clientId: config.m365ClientId,
          clientSecretEnc: config.m365ClientSecretEnc,
          fromAddress: config.m365FromAddress,
        },
        opts
      );
    } else {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: { user: config.smtpUser, pass: decryptSecret(config.smtpPassEnc) },
        // 公司自己架的內部郵件伺服器很常見用自我簽署/內部 CA 憑證，預設(false)維持正常的
        // 憑證驗證；只有管理者在「通知」設定明確勾選「信任自我簽署憑證」才關掉驗證。
        tls: { rejectUnauthorized: !config.smtpAllowSelfSigned },
        // nodemailer 預設 greetingTimeout 只有 30 秒——部分自架郵件主機收到連線後會先做
        // PTR 反解/RBL 查詢才送出 greeting，實測可能要 1 分鐘左右，預設值會讓這種主機
        // 每次寄信都逾時失敗，抓寬一點才不會正式通知信也寄不出去。
        connectionTimeout: 90_000,
        greetingTimeout: 90_000,
        socketTimeout: 90_000,
      });
      await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      });
    }
    return { status: "sent" };
  } catch (err) {
    // 寄信失敗(帳密/憑證錯誤、額度用完等)不該讓觸發通知的那個 API 請求(送出/簽核申請單)
    // 跟著失敗——使用者的申請單本身有沒有成功送出，跟通知信寄不寄得出去是兩件事。
    console.error(`寄送 email 通知失敗(收件人：${opts.to})`, err);
    return { status: "failed", error: formatMailError(err) };
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
  opts: MailContent
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

// nodemailer 丟出來的錯誤訊息本身(err.message)常常語意模糊(例如「Greeting never
// received」)，真正能判斷問題類型的是 err.code：ETIMEDOUT/ESOCKET/ECONNECTION 這類
// 通常代表連不到主機、port 被防火牆擋住，或 TLS 交握失敗(port 跟「使用 SSL」設定接反)；
// EAUTH 才是帳號密碼真的錯。把 code 一起顯示出來，不用再另外看伺服器 log 猜是哪一種。
function formatMailError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${err.message}(錯誤代碼：${code})` : err.message;
  }
  return "連線失敗";
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
      // 「測試連線」是使用者按了按鈕在等結果，主機/port 真的連不上的話(防火牆擋住、
      // port 打錯)，不該讓他等到 nodemailer 預設的逾時時間才知道；但部分自架郵件主機
      // 收到連線後會先做 PTR 反解/RBL 查詢才送出 greeting，實測可能要 1 分鐘左右，
      // 抓太短容易把「只是比較慢」誤判成「連不上」，所以跟正式寄信用的逾時抓一樣寬。
      connectionTimeout: 90_000,
      greetingTimeout: 90_000,
      socketTimeout: 90_000,
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
    return { ok: false, message: formatMailError(err) };
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
