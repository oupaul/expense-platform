import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { ActiveSessionsResult } from "@/types/platform";

const ROLE_LABEL: Record<string, string> = {
  applicant: "一般申請人",
  dept_manager: "部門主管",
  finance: "財務",
  ceo: "執行長",
  admin: "租戶管理員",
  platform_admin: "平台管理者",
};

function formatRelative(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} 分鐘前`;
}

// 給要更新/重啟服務前檢查用：列出最近 N 分鐘內有實際發出請求的使用者(純記憶體資料，
// 見後端 services/activityTracker.ts，服務重啟就會清空)。每 10 秒自動重新整理一次，
// 站在這個頁面看著它清空，就是「現在可以安心重啟」的信號。
export function ActiveSessions({ token }: { token: string }) {
  const [minutes, setMinutes] = useState(5);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["platform", "active-sessions", minutes],
    queryFn: () => apiFetch<ActiveSessionsResult>(`/platform/active-sessions?minutes=${minutes}`, { token }),
    refetchInterval: 10_000,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-xl font-bold">使用狀況</h1>
      <p className="text-sm text-muted-foreground">
        更新/重啟服務前，先來這裡確認有沒有人正在使用系統。這裡只看「最近幾分鐘內有沒有發出過
        請求」，服務本身剛重啟的話會暫時是空的，不代表真的沒人在用——重啟後等窗口時間過一輪
        (例如設定 5 分鐘就等 5 分鐘)再判讀會比較準。每 10 秒自動重新整理。
      </p>

      <div className="flex items-end gap-3 rounded border bg-white p-4">
        <div>
          <Label>判定窗口(分鐘)</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            <option value={5}>5 分鐘</option>
            <option value={15}>15 分鐘</option>
            <option value={30}>30 分鐘</option>
            <option value={60}>60 分鐘</option>
          </select>
        </div>
        {dataUpdatedAt > 0 && (
          <p className="text-xs text-muted-foreground">最後更新：{new Date(dataUpdatedAt).toLocaleTimeString("zh-TW")}</p>
        )}
      </div>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}

      {data && (
        <>
          {data.count === 0 ? (
            <p className="rounded bg-green-50 px-4 py-3 text-sm text-green-700">
              過去 {data.minutes} 分鐘內沒有任何使用者活動，適合進行更新或重啟。
            </p>
          ) : (
            <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-700">
              過去 {data.minutes} 分鐘內有 <strong>{data.count}</strong> 位使用者在操作系統，建議先確認或另行通知後再更新。
            </p>
          )}

          {data.count > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>使用者</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>租戶</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead className="text-right">最後動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sessions.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email ?? "-"}</TableCell>
                    <TableCell>{s.companyName ?? "-"}</TableCell>
                    <TableCell>{ROLE_LABEL[s.role] ?? s.role}</TableCell>
                    <TableCell className="text-right">{formatRelative(s.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
