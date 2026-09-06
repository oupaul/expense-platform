import { useRef, useState } from "react";
import { apiUpload, apiFetch, ApiError } from "@/lib/api";
import { AttachmentList } from "@/components/AttachmentList";
import type { AuthState } from "@/types/auth";
import type { AttachmentMeta } from "@/types/application";

export interface StagedFile {
  file: File;
  previewUrl: string;
}

interface Props {
  auth: AuthState;
  // 還在建立中、尚未有 id 的新申請單傳 null——這時如果有提供 ensureApplicationId，
  // 會先呼叫它拿一個真正的 id 再直接上傳；沒有提供的話才退回舊行為，檔案先留在瀏覽器
  // 記憶體(stagedFiles)，等申請單真的建立成功拿到 id 之後由外層負責補傳。
  applicationId: string | null;
  // 手機上很常見的操作順序是「先拍照、再填其他欄位」——如果表單完全空白、還沒觸發過
  // 自動存草稿，這張照片選下去那一刻 applicationId 還是 null，只能暫存在瀏覽器記憶體裡，
  // 換頁/換裝置就會不見。提供這個 callback 讓呼叫端可以「現在立刻」建一筆草稿拿到真正的
  // id，檔案就能直接上傳、真的存到伺服器，不用等使用者剛好先動了別的欄位觸發自動存檔。
  ensureApplicationId?: () => Promise<string>;
  existingAttachments: AttachmentMeta[];
  stagedFiles: StagedFile[];
  onStagedFilesChange: (files: StagedFile[]) => void;
  // 帶一個 id 參數回去：剛透過 ensureApplicationId 拿到 id 的當下，外層(DynamicExpenseForm)
  // 都還沒重新 render、傳進來的 applicationId prop 跟這裡呼叫端閉包住的還是舊值(null)，
  // 呼叫端如果只靠自己記得的 activeId 去 invalidate 快取，會抓錯 query key、畫面不會更新。
  // 直接把「這次上傳實際用的 id」傳回去，呼叫端才不用依賴自己那份可能還沒更新的狀態。
  onExistingChange?: (id: string) => void;
}

export function AttachmentUpload({
  auth,
  applicationId,
  ensureApplicationId,
  existingAttachments,
  stagedFiles,
  onStagedFilesChange,
  onExistingChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList);
    let targetId = applicationId;
    if (!targetId && ensureApplicationId) {
      setUploading(true);
      try {
        targetId = await ensureApplicationId();
      } catch {
        // 建草稿失敗(通常是網路問題)不能就這樣讓選好的檔案憑空消失——退回暫存在瀏覽器
        // 記憶體，跟完全沒有 ensureApplicationId 時的行為一樣，之後存草稿成功時一樣會補傳。
        setError("暫時無法存檔，檔案先留在這台裝置，等網路恢復或送出時會自動補傳");
        setUploading(false);
        onStagedFilesChange([...stagedFiles, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }
    if (targetId) {
      setUploading(true);
      try {
        await apiUpload(`/companies/${auth.user.companyId}/applications/${targetId}/attachments`, files, auth.token);
        onExistingChange?.(targetId);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "上傳失敗");
      } finally {
        setUploading(false);
      }
    } else {
      onStagedFilesChange([...stagedFiles, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeStaged = (index: number) => {
    URL.revokeObjectURL(stagedFiles[index].previewUrl);
    onStagedFilesChange(stagedFiles.filter((_, i) => i !== index));
  };

  const deleteExisting = async (attachmentId: string) => {
    if (!applicationId) return;
    setError(null);
    try {
      await apiFetch(`/companies/${auth.user.companyId}/applications/${applicationId}/attachments/${attachmentId}`, {
        method: "DELETE",
        token: auth.token,
      });
      onExistingChange?.(applicationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "刪除失敗");
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">憑證附件(選填)</p>
      {applicationId && existingAttachments.length > 0 && (
        <AttachmentList auth={auth} applicationId={applicationId} attachments={existingAttachments} onDelete={deleteExisting} />
      )}
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stagedFiles.map((sf, i) => (
            <div key={i} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs">
              <a href={sf.previewUrl} target="_blank" rel="noreferrer" className="underline">
                {sf.file.type === "application/pdf" ? "📄" : "🖼️"} {sf.file.name}
              </a>
              <button type="button" className="text-destructive" aria-label={`移除 ${sf.file.name}`} onClick={() => removeStaged(i)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading}
        className="block text-sm"
      />
      <p className="text-xs text-muted-foreground">
        手機可直接拍照或選相簿，電腦可選擇檔案；支援 JPG / PNG / WEBP / PDF，單檔最大 10MB。
      </p>
      {uploading && <p className="text-xs text-muted-foreground">上傳中…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
