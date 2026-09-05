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

// 憑證附件清單：圖片點了跳 lightbox，PDF 點了開新分頁用瀏覽器原生檢視器。
// 兩種情境都是先把檔案(帶登入 token)拉成本機 blob: URL 再顯示，不會把 token 暴露在網址上。
export function AttachmentList({ auth, applicationId, attachments, onDelete }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (att: AttachmentMeta) => {
    setError(null);
    setLoadingId(att.id);
    try {
      const url = await apiFetchBlobUrl(
        `/companies/${auth.user.companyId}/applications/${applicationId}/attachments/${att.id}`,
        auth.token
      );
      if (att.mimeType === "application/pdf") {
        window.open(url, "_blank", "noopener");
      } else {
        setLightboxUrl(url);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "附件載入失敗");
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
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="憑證附件預覽" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
