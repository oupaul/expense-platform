import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import type { NotificationConfig } from "@/types/platform";

// 全平台共用一組 SMTP 帳號寄信(不是每租戶各自設定)——這個系統是低量的內部簽核通知，
// 不是行銷群發，多加一層「每租戶自訂郵件主機」的複雜度(帳密存取、測試連線、錯誤排查
// 都要重來一份)目前報酬率不高，等真的有客戶明確需要再說。
export function NotificationSettings({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const configKey = ["platform", "notification-config"];
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState({
    smtpEnabled: false,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpFrom: "",
    smtpAllowSelfSigned: false,
    smtpPass: "",
    testRecipient: "",
  });

  const { data: config, isLoading, isError } = useQuery({
    queryKey: configKey,
    queryFn: () => apiFetch<NotificationConfig>("/platform/notification-config", { token }),
  });

  // 只在資料第一次載入時把表單填進去，避免使用者正在編輯時因為 query 重新整理被蓋掉。
  useEffect(() => {
    if (!config || loaded) return;
    setForm((p) => ({
      ...p,
      smtpEnabled: config.smtpEnabled,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser,
      smtpFrom: config.smtpFrom,
      smtpAllowSelfSigned: config.smtpAllowSelfSigned,
    }));
    setLoaded(true);
  }, [config, loaded]);

  const invalidateConfig = () => queryClient.invalidateQueries({ queryKey: configKey });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/platform/notification-config", {
        method: "PUT",
        token,
        body: {
          smtpEnabled: form.smtpEnabled,
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
          smtpSecure: form.smtpSecure,
          smtpUser: form.smtpUser,
          smtpFrom: form.smtpFrom,
          smtpAllowSelfSigned: form.smtpAllowSelfSigned,
          ...(form.smtpPass ? { smtpPass: form.smtpPass } : {}),
        },
      }),
    onSuccess: () => {
      setError(null);
      setForm((p) => ({ ...p, smtpPass: "" }));
      invalidateConfig();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "儲存失敗"),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>("/platform/notification-config/test", {
        method: "POST",
        token,
        body: {
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
          smtpSecure: form.smtpSecure,
          smtpUser: form.smtpUser,
          smtpAllowSelfSigned: form.smtpAllowSelfSigned,
          ...(form.smtpPass ? { smtpPass: form.smtpPass } : {}),
          ...(form.testRecipient ? { testRecipient: form.testRecipient } : {}),
        },
      }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "測試失敗"),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中…</div>;
  if (isError || !config) return <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-xl font-bold">通知設定</h1>
      <p className="text-sm text-muted-foreground">
        申請單送出/簽核/核准/駁回/退回時，站內通知(鈴鐺清單)一定會記錄；這裡是額外的 email
        提醒——沒有啟用或沒有設定完整的話，email 不會寄出，但站內通知照常運作。全平台共用一組
        SMTP 帳號，不是每個租戶各自設定。
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3 rounded border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.smtpEnabled}
            onChange={(e) => setForm((p) => ({ ...p, smtpEnabled: e.target.checked }))}
          />
          啟用 email 通知
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>SMTP 主機</Label>
            <Input value={form.smtpHost} onChange={(e) => setForm((p) => ({ ...p, smtpHost: e.target.value }))} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <Label>Port</Label>
            <Input
              type="number"
              value={form.smtpPort}
              onChange={(e) => setForm((p) => ({ ...p, smtpPort: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>使用者帳號</Label>
            <Input value={form.smtpUser} onChange={(e) => setForm((p) => ({ ...p, smtpUser: e.target.value }))} placeholder="your-account@gmail.com" />
          </div>
          <div>
            <Label>寄件人顯示(選填，留空用帳號本身)</Label>
            <Input value={form.smtpFrom} onChange={(e) => setForm((p) => ({ ...p, smtpFrom: e.target.value }))} placeholder="expense-platform@your-domain.com" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.smtpSecure}
            onChange={(e) => setForm((p) => ({ ...p, smtpSecure: e.target.checked }))}
          />
          使用 SSL(通常 port 465 才需要勾選；587 用 STARTTLS 不用勾)
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.smtpAllowSelfSigned}
            onChange={(e) => setForm((p) => ({ ...p, smtpAllowSelfSigned: e.target.checked }))}
          />
          信任自我簽署/內部憑證
        </label>
        {form.smtpAllowSelfSigned && (
          <p className="text-xs text-amber-600">
            關閉後不會驗證郵件伺服器憑證的簽發者，只建議用在公司自己架設、內部網路可信任的
            郵件主機——如果連線出現「unable to get local issuer certificate」通常就是這個
            原因(自我簽署或內部 CA 簽發的憑證，不在 Node.js 內建的信任清單裡)。公開的服務
            (Gmail、Outlook 等)不需要、也不應該勾選這個選項。
          </p>
        )}

        <div>
          <Label>密碼{config.hasSmtpPass ? "(已設定，留空表示不更換)" : "(尚未設定)"}</Label>
          <Input
            type="password"
            value={form.smtpPass}
            onChange={(e) => setForm((p) => ({ ...p, smtpPass: e.target.value }))}
            placeholder="應用程式密碼，不是登入密碼(大部分服務商都是如此)"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "儲存中…" : "儲存設定"}
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded border p-4">
        <Label>測試連線(選填收件信箱，留空只測連線帳密)</Label>
        <div className="flex items-center gap-2">
          <Input
            className="max-w-xs"
            value={form.testRecipient}
            onChange={(e) => setForm((p) => ({ ...p, testRecipient: e.target.value }))}
            placeholder="test@example.com"
          />
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? "測試中…" : "測試連線"}
          </Button>
        </div>
        {testMutation.data && (
          <p className={`text-sm ${testMutation.data.ok ? "text-green-600" : "text-destructive"}`}>{testMutation.data.message}</p>
        )}
      </div>
    </div>
  );
}
