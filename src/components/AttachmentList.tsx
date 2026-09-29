import { useState } from "react";
import { apiFetchBlobUrl, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { AttachmentMeta } from "@/types/application";

interface Props {
  auth: AuthState;
  applicationId: string;
  attachments: AttachmentMeta[];
  onDelete?: (attachmentId: string) => void;
}

// 圖片檢視器的畫面(工具列 + 可旋轉的圖片)，用 DOM API 組出來而不是塞一大串 HTML 字串——
// 檔名是申請人自己上傳附件時填的、不是這個系統的內容，直接組字串塞進 innerHTML 的話，
// 惡意檔名可以在審核者開啟附件時跑進審核者的瀏覽器分頁執行；用 createElement/textContent
// 完全不會有這個問題，不管檔名塞了什麼字元都只會被當成純文字顯示。
function buildImageViewer(win: Window, filename: string, imageUrl: string) {
  win.document.title = filename;
  win.document.body.innerHTML = "";
  win.document.body.style.cssText = "margin:0;background:#111;height:100vh;display:flex;flex-direction:column;font-family:sans-serif;";

  const toolbar = win.document.createElement("div");
  toolbar.style.cssText = "display:flex;gap:8px;padding:8px;background:#222;flex-shrink:0;";

  const rotateLeftBtn = win.document.createElement("button");
  rotateLeftBtn.textContent = "↺ 向左旋轉";
  const rotateRightBtn = win.document.createElement("button");
  rotateRightBtn.textContent = "↻ 向右旋轉";
  for (const btn of [rotateLeftBtn, rotateRightBtn]) {
    btn.style.cssText = "padding:6px 12px;cursor:pointer;";
  }
  toolbar.append(rotateLeftBtn, rotateRightBtn);

  const viewer = win.document.createElement("div");
  viewer.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;";

  const img = win.document.createElement("img");
  img.src = imageUrl;
  img.alt = filename;
  img.style.cssText = "max-width:90%;max-height:90%;transition:transform 0.15s;";

  viewer.appendChild(img);
  win.document.body.append(toolbar, viewer);

  let rotation = 0;
  const applyRotation = () => {
    img.style.transform = `rotate(${rotation}deg)`;
  };
  rotateLeftBtn.onclick = () => {
    rotation -= 90;
    applyRotation();
  };
  rotateRightBtn.onclick = () => {
    rotation += 90;
    applyRotation();
  };
}

// 憑證附件清單：PDF 點了開新分頁用瀏覽器原生檢視器；圖片點了也是開獨立視窗(不是蓋住
// 整個審核明細版面的全螢幕遮罩)，並且多做了旋轉功能——附件很常是手機直接拍照上傳、
// 方向沒轉正，審核者自己在檢視器裡轉正比較實際，不用要求申請人重新上傳。
// 兩種情境都是先把檔案(帶登入 token)拉成本機 blob: URL 再顯示，不會把 token 暴露在網址上。
export function AttachmentList({ auth, applicationId, attachments, onDelete }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (att: AttachmentMeta) => {
    setError(null);
    // 圖片用的新視窗要在使用者點擊當下、還沒 await 之前就同步開好——瀏覽器的快顯封鎖
    // 通常只放行「使用者點擊那一刻」直接呼叫的 window.open，中間先 await 抓完圖檔資料
    // 再開窗的話，很容易被判定成不是使用者主動觸發而被擋掉。先開一個空視窗顯示「載入中」，
    // 圖檔抓回來後再把內容填進去。
    const isPdf = att.mimeType === "application/pdf";
    const win = isPdf ? null : window.open("", "_blank", "noopener,width=1000,height=800");
    if (!isPdf && !win) {
      setError("彈出視窗被瀏覽器擋住，請允許彈出視窗後再試一次");
      return;
    }
    if (win) {
      win.document.title = att.filename;
      win.document.body.style.cssText = "margin:0;background:#111;height:100vh;";
      const loadingText = win.document.createElement("p");
      loadingText.textContent = "圖片載入中…";
      loadingText.style.cssText = "color:#fff;text-align:center;margin-top:40px;font-family:sans-serif;";
      win.document.body.appendChild(loadingText);
    }

    setLoadingId(att.id);
    try {
      const url = await apiFetchBlobUrl(
        `/companies/${auth.user.companyId}/applications/${applicationId}/attachments/${att.id}`,
        auth.token
      );
      if (isPdf) {
        window.open(url, "_blank", "noopener");
        return;
      }
      if (!win || win.closed) {
        setError("彈出視窗已關閉，請重新點一次附件");
        return;
      }
      buildImageViewer(win, att.filename, url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "附件載入失敗");
      win?.close();
    } finally {
      setLoadingId(null);
    }
  };

  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <div key={att.id} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs">
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={loadingId === att.id}
              onClick={() => open(att)}
            >
              {att.mimeType === "application/pdf" ? "📄" : "🖼️"} {att.filename}
            </button>
            {onDelete && (
              <button
                type="button"
                className="text-destructive"
                aria-label={`刪除附件 ${att.filename}`}
                onClick={() => onDelete(att.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
