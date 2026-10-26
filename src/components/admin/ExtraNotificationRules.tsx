import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ExtraNotifyEvent, ExtraNotifyRulesResult, ExtraNotifyTarget } from "@/types/admin";

const EVENTS: { value: ExtraNotifyEvent; label: string; hint: string }[] = [
  { value: "approved", label: "核准完成", hint: "最後一關核准通過時" },
  { value: "rejected", label: "被駁回", hint: "任何一關被駁回時" },
  { value: "returned", label: "被退回補件", hint: "任何一關被退回時" },
];

type Draft = Record<ExtraNotifyEvent, ExtraNotifyTarget>;

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// 申請單核准完成/被駁回/被退回時，申請人本人一定會收到；這裡設定「除了申請人之外還要
// 通知誰」(例如核准完成後通知財務去請款)。可以選角色(該角色的所有啟用中使用者)與
// 個別使用者，兩種可以並用，同一個人符合多個條件也只會收到一封。
export function ExtraNotificationRules({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const queryKey = ["company-notification-rules", auth.user.companyId];
  const path = `/companies/${auth.user.companyId}/notification-rules`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<ExtraNotifyRulesResult>(path, { token: auth.token }),
  });

  // 只在第一次載入時把伺服器的規則放進草稿，之後的編輯不會被重新整理蓋掉。
  useEffect(() => {
    if (data && !draft) setDraft(data.rules);
  }, [data, draft]);

  const saveMutation = useMutation({
    mutationFn: (rules: Draft) => apiFetch(path, { method: "PUT", token: auth.token, body: rules }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "儲存失敗"),
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !data || !draft) return <div className="p-4 text-sm text-destructive">載入失敗，請重新整理再試一次</div>;

  const update = (event: ExtraNotifyEvent, patch: Partial<ExtraNotifyTarget>) => {
    setSaved(false);
    setDraft((prev) => (prev ? { ...prev, [event]: { ...prev[event], ...patch } } : prev));
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">額外通知對象</h3>
      <p className="text-xs text-muted-foreground">
        申請單核准完成、被駁回或被退回時，<strong>申請人本人一定會收到通知</strong>，不用在這裡勾選。這裡可以另外指定
        還要通知哪些人，例如核准完成後通知財務。做出該簽核決定的人自己不會重複收到。
      </p>
      <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
        通知只會帶出申請人、部門、用途、金額等摘要。收件人若要在系統內查看申請單明細，需要具備查看權限(例如在「簽核與使用者」
        分頁對該使用者開啟「查閱全公司報表」)；沒有權限的人點進去會看不到該張單。
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {EVENTS.map((ev) => (
        <div key={ev.value} className="space-y-3 rounded border p-4">
          <div>
            <h4 className="text-sm font-semibold">{ev.label}</h4>
            <p className="text-xs text-muted-foreground">{ev.hint}</p>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium">依角色(該角色所有啟用中的使用者)</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {data.roles.map((r) => (
                <label key={r.roleKey} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[ev.value].roles.includes(r.roleKey)}
                    onChange={() => update(ev.value, { roles: toggle(draft[ev.value].roles, r.roleKey) })}
                  />
                  {r.label ? `${r.label}(${r.roleKey})` : r.roleKey}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium">指定個別使用者</div>
            <div className="max-h-40 space-y-1 overflow-auto rounded border p-2">
              {data.users.map((u) => (
                <label key={u.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[ev.value].userIds.includes(u.id)}
                    onChange={() => update(ev.value, { userIds: toggle(draft[ev.value].userIds, u.id) })}
                  />
                  {u.name}
                  <span className="text-xs text-muted-foreground">
                    {u.email}・{u.role}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "儲存中…" : "儲存設定"}
        </Button>
        {saved && <span className="text-sm text-green-600">已儲存</span>}
      </div>
    </div>
  );
}
