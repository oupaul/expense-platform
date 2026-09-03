import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { CompanyFormConfig } from "@/types/company-config";

export function CompanySettingsManager({ auth, config }: { auth: AuthState; config: CompanyFormConfig }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (multiCurrencyEnabled: boolean) =>
      apiFetch(`/companies/${auth.user.companyId}/settings`, {
        method: "PUT",
        token: auth.token,
        body: { multiCurrencyEnabled },
      }),
    onSuccess: () => {
      // config 是用 companySlug 當 key 快取的，設定改變後要讓表單重新抓一次
      queryClient.invalidateQueries({ queryKey: ["company-config", auth.user.companySlug] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "更新失敗"),
  });

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">公司設定</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.multiCurrencyEnabled}
          onChange={(e) => toggleMutation.mutate(e.target.checked)}
          disabled={toggleMutation.isPending}
        />
        啟用多幣別(開啟後費用明細可選擇 TWD 以外的幣別，需要在下方設定匯率)
      </label>
    </div>
  );
}
