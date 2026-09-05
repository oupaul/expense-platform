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
  // 還在建立中、尚未有 id 的新申請單傳 null——這時檔案先留在瀏覽器記憶體(stagedFiles)，
  // 等申請單真的建立成功拿到 id 之後，由外層(DynamicExpenseForm)負責把暫存檔案補傳上去。
  applicationId: string | null;
  existingAttachments: AttachmentMeta[];
  stagedFiles: StagedFile[];
  onStagedFilesChange: (files: StagedFile[]) => void;
  onExistingChange?: () => void;
}

export function AttachmentUpload({
  auth,
  applicationId,
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
    if (applicationId) {
      setUploading(true);
      try {
        await apiUpload(`/companies/${auth.user.companyId}/applications/${applicationId}/attachments`, files, auth.token);
        onExistingChange?.();
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
      onExistingChange?.();
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
