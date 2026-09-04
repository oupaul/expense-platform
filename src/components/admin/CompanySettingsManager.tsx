import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
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

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">公司設定</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}

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
    </div>
  );
}
