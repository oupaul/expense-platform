import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, apiFetchBlobUrl, ApiError } from "@/lib/api";
import type { BackupConfig, BackupFileItem } from "@/types/platform";

// 簡單模式只支援「每天固定時間」，背後轉成 cron 表達式；不是這個形狀的
// (例如每週、每小時)就自動切到進階模式讓使用者直接編輯 cron 表達式。
const DAILY_PATTERN = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;

function cronToDailyTime(cronExpression: string): { hour: string; minute: string } | null {
  const match = cronExpression.match(DAILY_PATTERN);
  if (!match) return null;
  return { minute: match[1], hour: match[2] };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupSettings({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const configKey = ["platform", "backup-config"];
  const filesKey = ["platform", "backups"];
  const [error, setError] = useState<string | null>(null);
  const [runNowResult, setRunNowResult] = useState<string | null>(null);
  const [advancedCron, setAdvancedCron] = useState(false);

  const [form, setForm] = useState({
    enabled: false,
    hour: "3",
    minute: "0",
    cronExpression: "0 3 * * *",
    retentionDays: 14,
    nasEnabled: false,
    nasHost: "",
    nasPort: 22,
    nasUsername: "",
    nasRemotePath: "",
    nasPrivateKey: "",
  });
  const [loaded, setLoaded] = useState(false);

  const { data: config, isLoading, isError } = useQuery({
    queryKey: configKey,
    queryFn: () => apiFetch<BackupConfig>("/platform/backup-config", { token }),
  });

  const { data: files } = useQuery({
    queryKey: filesKey,
    queryFn: () => apiFetch<BackupFileItem[]>("/platform/backups", { token }),
  });

  // 只在資料第一次載入時把表單填進去，避免使用者正在編輯時因為 query 重新整理被蓋掉。
  useEffect(() => {
    if (!config || loaded) return;
    const daily = cronToDailyTime(config.cronExpression);
    setForm({
      enabled: config.enabled,
      hour: daily?.hour ?? "3",
      minute: daily?.minute ?? "0",
      cronExpression: config.cronExpression,
      retentionDays: config.retentionDays,
      nasEnabled: config.nasEnabled,
      nasHost: config.nasHost,
      nasPort: config.nasPort,
      nasUsername: config.nasUsername,
      nasRemotePath: config.nasRemotePath,
      nasPrivateKey: "",
    });
    setAdvancedCron(!daily);
    setLoaded(true);
  }, [config, loaded]);

  const invalidateConfig = () => queryClient.invalidateQueries({ queryKey: configKey });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/platform/backup-config", {
        method: "PUT",
        token,
        body: {
          enabled: form.enabled,
          cronExpression: advancedCron ? form.cronExpression : `${form.minute} ${form.hour} * * *`,
          retentionDays: form.retentionDays,
          nasEnabled: form.nasEnabled,
          nasHost: form.nasHost,
          nasPort: form.nasPort,
          nasUsername: form.nasUsername,
          nasRemotePath: form.nasRemotePath,
          ...(form.nasPrivateKey ? { nasPrivateKey: form.nasPrivateKey } : {}),
        },
      }),
    onSuccess: () => {
      setError(null);
      setForm((p) => ({ ...p, nasPrivateKey: "" }));
      invalidateConfig();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "儲存失敗"),
  });

  const runNowMutation = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>("/platform/backup-config/run-now", { method: "POST", token }),
    onSuccess: (result) => {
      setRunNowResult(result.message);
      invalidateConfig();
      queryClient.invalidateQueries({ queryKey: filesKey });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "執行失敗"),
  });

  const testNasMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>("/platform/backup-config/test-nas", {
        method: "POST",
        token,
        body: {
          nasHost: form.nasHost,
          nasPort: form.nasPort,
          nasUsername: form.nasUsername,
          nasRemotePath: form.nasRemotePath,
          ...(form.nasPrivateKey ? { nasPrivateKey: form.nasPrivateKey } : {}),
        },
      }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "測試失敗"),
  });

  const download = async (filename: string) => {
    setError(null);
    try {
      const url = await apiFetchBlobUrl(`/platform/backups/${filename}`, token);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "下載失敗");
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中…</div>;
  if (isError || !config) return <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-xl font-bold">備份設定</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3 rounded border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />
          啟用自動備份
        </label>

        {!advancedCron ? (
          <div className="flex items-center gap-2 text-sm">
            <span>每天</span>
            <Input
              className="w-16"
              type="number"
              min={0}
              max={23}
              value={form.hour}
              onChange={(e) => setForm((p) => ({ ...p, hour: e.target.value }))}
            />
            <span>時</span>
            <Input
              className="w-16"
              type="number"
              min={0}
              max={59}
              value={form.minute}
              onChange={(e) => setForm((p) => ({ ...p, minute: e.target.value }))}
            />
            <span>分執行一次</span>
            <button type="button" className="ml-2 text-xs text-muted-foreground underline" onClick={() => setAdvancedCron(true)}>
              進階(自訂 cron 表達式)
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>Cron 表達式(例如每天凌晨 3 點是 "0 3 * * *")</Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.cronExpression}
                onChange={(e) => setForm((p) => ({ ...p, cronExpression: e.target.value }))}
              />
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAdvancedCron(false)}>
                改回簡單模式
              </button>
            </div>
          </div>
        )}

        <div>
          <Label>保留天數</Label>
          <Input
            className="w-24"
            type="number"
            min={1}
            max={365}
            value={form.retentionDays}
            onChange={(e) => setForm((p) => ({ ...p, retentionDays: Number(e.target.value) }))}
          />
        </div>

        {config.lastRunAt && (
          <p className={`text-sm ${config.lastRunStatus === "success" ? "text-green-600" : "text-destructive"}`}>
            上次備份：{config.lastRunStatus === "success" ? "成功" : "失敗"}，
            {new Date(config.lastRunAt).toLocaleString("zh-TW")}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "儲存中…" : "儲存排程設定"}
          </Button>
          <Button variant="outline" onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending}>
            {runNowMutation.isPending ? "執行中…" : "立即備份一次"}
          </Button>
        </div>
        {runNowResult && <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{runNowResult}</pre>}
      </div>

      <div className="space-y-3 rounded border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.nasEnabled}
            onChange={(e) => setForm((p) => ({ ...p, nasEnabled: e.target.checked }))}
          />
          同步備份到遠端 NAS(SSH / rsync)
        </label>
        {form.nasEnabled && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>NAS 主機位址</Label>
                <Input value={form.nasHost} onChange={(e) => setForm((p) => ({ ...p, nasHost: e.target.value }))} placeholder="nas.example.com" />
              </div>
              <div>
                <Label>SSH Port</Label>
                <Input
                  type="number"
                  value={form.nasPort}
                  onChange={(e) => setForm((p) => ({ ...p, nasPort: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>使用者名稱</Label>
                <Input value={form.nasUsername} onChange={(e) => setForm((p) => ({ ...p, nasUsername: e.target.value }))} />
              </div>
              <div>
                <Label>遠端路徑</Label>
                <Input
                  value={form.nasRemotePath}
                  onChange={(e) => setForm((p) => ({ ...p, nasRemotePath: e.target.value }))}
                  placeholder="/volume1/backups/expense-platform"
                />
              </div>
            </div>
            <div>
              <Label>
                SSH 私鑰{config.hasNasPrivateKey ? "(已設定，留空表示不更換)" : "(尚未設定)"}
              </Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                value={form.nasPrivateKey}
                onChange={(e) => setForm((p) => ({ ...p, nasPrivateKey: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => testNasMutation.mutate()} disabled={testNasMutation.isPending}>
                {testNasMutation.isPending ? "測試中…" : "測試連線"}
              </Button>
              {testNasMutation.data && (
                <span className={`text-sm ${testNasMutation.data.ok ? "text-green-600" : "text-destructive"}`}>
                  {testNasMutation.data.message}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold">備份清單</h2>
        {(!files || files.length === 0) && <p className="text-sm text-muted-foreground">目前還沒有任何備份檔案</p>}
        {files && files.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>檔名</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>時間</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow key={f.filename}>
                  <TableCell className="font-mono text-xs">{f.filename}</TableCell>
                  <TableCell>{formatBytes(f.size)}</TableCell>
                  <TableCell>{new Date(f.createdAt).toLocaleString("zh-TW")}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => download(f.filename)}>
                      下載
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
