import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { NotificationLogResult } from "@/types/admin";

const STATUS_LABEL: Record<string, string> = {
  sent: "已寄送",
  failed: "寄送失敗",
  skipped: "未寄送(未設定帳號)",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  sent: "text-green-700 bg-green-50",
  failed: "text-destructive bg-red-50",
  skipped: "text-muted-foreground bg-slate-100",
};

// 給管理者確認「通知的 email 到底有沒有真的寄出去」用——站內通知(鈴鐺清單)寫入成功
// 不代表 email 也寄成功，這裡才是唯一看得到 email 實際結果的地方。只顯示最近 100 筆，
// 這本來就是拿來查「最近有沒有寄送異常」，不是要當完整歷史紀錄用。
export function NotificationLog({ auth }: { auth: AuthState }) {
  const [statusFilter, setStatusFilter] = useState<"" | "sent" | "failed" | "skipped">("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-notification-log", auth.user.companyId, statusFilter],
    queryFn: () =>
      apiFetch<NotificationLogResult>(
        `/companies/${auth.user.companyId}/notification-log${statusFilter ? `?emailStatus=${statusFilter}` : ""}`,
        { token: auth.token }
      ),
  });

  const countByStatus = Object.fromEntries((data?.statusCounts ?? []).map((s) => [s.status, s.count]));

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">通知寄送記錄</h3>
      <p className="text-xs text-muted-foreground">
        每一則通知(審核提醒、核准/駁回/退回結果等)實際的 email 寄送結果，只顯示最近 100 筆。
        站內通知本身有沒有寫入成功，跟 email 寄不寄得出去是兩回事，這裡看的是後者。
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["sent", "failed", "skipped"] as const).map((status) => (
          <span key={status} className={`rounded px-2 py-1 ${STATUS_BADGE_CLASS[status]}`}>
            {STATUS_LABEL[status]}：{countByStatus[status] ?? 0}
          </span>
        ))}
      </div>

      <div>
        <Label>篩選狀態</Label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="">全部</option>
          <option value="sent">已寄送</option>
          <option value="failed">寄送失敗</option>
          <option value="skipped">未寄送(未設定帳號)</option>
        </select>
      </div>

      {isLoading && <div className="p-4 text-sm text-muted-foreground">載入中…</div>}
      {isError && <div className="p-4 text-sm text-destructive">載入失敗，請重新整理再試一次</div>}

      {data && (
        <>
          {data.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">沒有符合條件的記錄</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>時間</TableHead>
                  <TableHead>收件人</TableHead>
                  <TableHead>通知內容</TableHead>
                  <TableHead>Email 狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("zh-TW")}
                    </TableCell>
                    <TableCell>
                      <div>{item.recipientName}</div>
                      <div className="text-xs text-muted-foreground">{item.recipientEmail}</div>
                    </TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE_CLASS[item.emailStatus]}`}>
                        {STATUS_LABEL[item.emailStatus]}
                      </span>
                      {item.emailError && <div className="mt-1 max-w-xs text-xs text-destructive">{item.emailError}</div>}
                    </TableCell>
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
