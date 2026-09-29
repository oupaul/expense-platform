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

// 憑證附件清單：PDF 點了開新分頁用瀏覽器原生檢視器；圖片改成「就地展開」，直接在
// 這塊區域下方顯示，不開新視窗、也不是蓋住整頁的全螢幕遮罩。原本試過開獨立視窗
// (window.open)，但實測發現部分瀏覽器的快顯封鎖設定即使在使用者點擊當下同步呼叫
// 還是會擋下來(不同瀏覽器/使用者設定的判斷標準不一，不能假設一定放行)，就地展開
// 完全不受這個問題影響——代價是展開後會把下面的簽核進度往下推，但比起開不出視窗、
// 整個功能失效更可靠。多加了旋轉功能，手機拍照上傳常常方向沒轉正，審核者在這裡
// 就能自己轉正看，不用要求申請人重新上傳。
export function AttachmentList({ auth, applicationId, attachments, onDelete }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const collapse = () => {
    setExpandedId(null);
    setImageUrl(null);
  };

  const open = async (att: AttachmentMeta) => {
    setError(null);
    if (att.mimeType === "application/pdf") {
      setLoadingId(att.id);
      try {
        const url = await apiFetchBlobUrl(
          `/companies/${auth.user.companyId}/applications/${applicationId}/attachments/${att.id}`,
          auth.token
        );
        window.open(url, "_blank", "noopener");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "附件載入失敗");
      } finally {
        setLoadingId(null);
      }
      return;
    }

    // 圖片：再點一次同一個附件就收合，避免使用者搞不清楚「怎麼點都沒反應」。
    if (expandedId === att.id) {
      collapse();
      return;
    }

    setLoadingId(att.id);
    try {
      const url = await apiFetchBlobUrl(
        `/companies/${auth.user.companyId}/applications/${applicationId}/attachments/${att.id}`,
        auth.token
      );
      setExpandedId(att.id);
      setImageUrl(url);
      setRotation(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "附件載入失敗");
    } finally {
      setLoadingId(null);
    }
  };

  if (attachments.length === 0) return null;

  const expandedAttachment = attachments.find((a) => a.id === expandedId);

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
      {expandedAttachment && imageUrl && (
        <div className="space-y-2 rounded border bg-slate-900 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white">{expandedAttachment.filename}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                onClick={() => setRotation((r) => r - 90)}
              >
                ↺ 向左旋轉
              </button>
              <button
                type="button"
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                onClick={() => setRotation((r) => r + 90)}
              >
                ↻ 向右旋轉
              </button>
              <button
                type="button"
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                onClick={collapse}
              >
                收合
              </button>
            </div>
          </div>
          <div className="flex max-h-[70vh] items-center justify-center overflow-auto">
            <img
              src={imageUrl}
              alt={expandedAttachment.filename}
              className="max-h-[65vh] max-w-full object-contain transition-transform duration-150"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
