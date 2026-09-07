import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, apiUploadFile, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { CompanyFormConfig, OptionalFields } from "@/types/company-config";

const OPTIONAL_FIELD_LABELS: { key: keyof OptionalFields; label: string }[] = [
  { key: "projectCode", label: "專案編號(費用明細多一欄，可搭配特定費用類別使用)" },
  { key: "invoiceDate", label: "發票日期(費用明細多一欄，個人代墊費用可不填)" },
  { key: "payeeInfo", label: "受款人資訊(表單下方顯示受款人欄位)" },
  { key: "requestedPaymentDate", label: "需求付款日(表單下方顯示指定付款日期欄位)" },
];

export function CompanySettingsManager({ auth, config }: { auth: AuthState; config: CompanyFormConfig }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["company-config", auth.user.companySlug] });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "更新失敗");

  const currencyMutation = useMutation({
    mutationFn: (multiCurrencyEnabled: boolean) =>
      apiFetch(`/companies/${auth.user.companyId}/settings`, {
        method: "PUT",
        token: auth.token,
        body: { multiCurrencyEnabled },
      }),
    onSuccess: invalidate,
    onError,
  });

  const brandingMutation = useMutation({
    mutationFn: (patch: { name?: string; nameEn?: string; logoUrl?: string; appUrl?: string }) =>
      apiFetch(`/companies/${auth.user.companyId}/settings`, { method: "PUT", token: auth.token, body: patch }),
    onSuccess: invalidate,
    onError,
  });

  const optionalFieldMutation = useMutation({
    mutationFn: (patch: Partial<OptionalFields>) =>
      apiFetch(`/companies/${auth.user.companyId}/settings`, {
        method: "PUT",
        token: auth.token,
        body: { optionalFields: patch },
      }),
    onSuccess: invalidate,
    onError,
  });

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      apiUploadFile<{ logoUrl: string }>(`/companies/${auth.user.companyId}/logo`, "logo", file, auth.token),
    onSuccess: invalidate,
    onError,
  });

  const printRowsPerPageMutation = useMutation({
    mutationFn: (printRowsPerPage: number) =>
      apiFetch(`/companies/${auth.user.companyId}/settings`, {
        method: "PUT",
        token: auth.token,
        body: { printRowsPerPage },
      }),
    onSuccess: invalidate,
    onError,
  });

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">公司設定</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3 border-b pb-3">
        <div>
          <Label>公司名稱(登入後瀏覽器分頁標題也會用這個)</Label>
          <Input
            defaultValue={config.branding.name}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value && value !== config.branding.name) brandingMutation.mutate({ name: value });
            }}
          />
        </div>
        <div>
          <Label>英文名稱(選填)</Label>
          <Input
            defaultValue={config.branding.nameEn ?? ""}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (config.branding.nameEn ?? "")) brandingMutation.mutate({ nameEn: value });
            }}
          />
        </div>
        <div className="col-span-2">
          <Label>瀏覽器分頁圖示(favicon，選填，留空還原成預設圖示)</Label>
          <div className="flex items-center gap-3">
            {config.branding.logoUrl && (
              <img
                src={config.branding.logoUrl}
                alt="目前的圖示"
                className="h-8 w-8 rounded border object-contain"
              />
            )}
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-auto"
              disabled={logoUploadMutation.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) logoUploadMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            上傳圖片檔案(PNG/JPEG/WEBP)會自動轉成 PNG、縮到 256x256 以內。也可以直接貼外部圖片網址：
          </p>
          <Input
            className="mt-1"
            defaultValue={config.branding.logoUrl ?? ""}
            placeholder="https://example.com/favicon.png"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (config.branding.logoUrl ?? "")) brandingMutation.mutate({ logoUrl: value });
            }}
          />
        </div>
        <div className="col-span-2">
          <Label>系統網址(選填)</Label>
          <Input
            defaultValue={config.branding.appUrl ?? ""}
            placeholder="https://your-domain.com"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (config.branding.appUrl ?? "")) brandingMutation.mutate({ appUrl: value });
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            填了的話，email 通知裡會附上「查看並簽核」的連結直接連到這個網址；留空的話信件
            就只有文字說明，沒有連結。
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.multiCurrencyEnabled}
          onChange={(e) => currencyMutation.mutate(e.target.checked)}
          disabled={currencyMutation.isPending}
        />
        啟用多幣別(開啟後費用明細可選擇 TWD 以外的幣別，需要在下方設定匯率)
      </label>

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-medium">費用明細選配欄位</p>
        {OPTIONAL_FIELD_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.optionalFields[key]}
              onChange={(e) => optionalFieldMutation.mutate({ [key]: e.target.checked })}
              disabled={optionalFieldMutation.isPending}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="border-t pt-3">
        <Label>列印/PDF 每頁最多幾筆費用明細(1-20，超過就自動分頁)</Label>
        <Input
          type="number"
          min={1}
          max={20}
          className="w-24"
          defaultValue={config.printRowsPerPage}
          onBlur={(e) => {
            const value = Number(e.target.value);
            if (Number.isInteger(value) && value >= 1 && value <= 20 && value !== config.printRowsPerPage) {
              printRowsPerPageMutation.mutate(value);
            }
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          實測若「說明」欄位都是短文字，一頁 A4 大約可以放到 16 筆左右；如果常常填寫較長的說明文字建議調低，
          避免每筆換行擠爆版面。預設 12 筆是留有安全空間的折衷值。
        </p>
      </div>
    </div>
  );
}
