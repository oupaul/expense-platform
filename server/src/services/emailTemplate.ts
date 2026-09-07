// 通知信件原本是純文字，內容太陽春(沒有申請人是誰、沒有用途、沒有連結)。這裡組一份
// 簡單的品牌化 HTML(套用公司自己的顏色)，搭配一份對應的純文字版一起寄(multipart/
// alternative)，收信軟體不支援 HTML 的話還是看得到內容。

// 內文有些欄位(申請人姓名、用途說明、簽核備註)是使用者自己填的自由文字，組進 HTML 前
// 一定要轉義，不然裡面如果剛好有 <script> 之類的字元，會被當成真的標籤處理。
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface NotificationEmailParams {
  companyName: string;
  primaryColor: string;
  headerBgColor: string;
  title: string;
  // 每一行是一組「標籤：內容」，例如 ["申請人", "王小明"]——比一大段文字排版更清楚，
  // 收件人一眼就能抓到重點(誰、多少錢、目前在哪一關)，不用整段讀完才知道。
  fields: [label: string, value: string][];
  note?: string;
  linkUrl?: string;
  linkLabel?: string;
}

export function renderNotificationEmailHtml(params: NotificationEmailParams): string {
  const rows = params.fields
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#888;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:4px 0;color:#222;font-size:14px;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  const noteHtml = params.note
    ? `<p style="margin:16px 0 0;color:#555;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(params.note)}</p>`
    : "";

  const buttonHtml = params.linkUrl
    ? `<div style="margin-top:24px;">
        <a href="${escapeHtml(params.linkUrl)}"
           style="display:inline-block;padding:10px 24px;background:${params.primaryColor};color:#ffffff;
                  text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;">
          ${escapeHtml(params.linkLabel ?? "查看並處理")}
        </a>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;">
      <div style="background:${params.headerBgColor};color:#ffffff;padding:16px 24px;font-size:15px;font-weight:bold;">
        ${escapeHtml(params.companyName)}
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#111;">${escapeHtml(params.title)}</h2>
        <table style="border-collapse:collapse;">
          ${rows}
        </table>
        ${noteHtml}
        ${buttonHtml}
      </div>
    </div>
  </body>
</html>`;
}
