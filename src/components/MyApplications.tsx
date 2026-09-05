import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ApplicationListItem } from "@/types/application";
import { ApplicationDetail } from "@/components/ApplicationDetail";

const STATUS_LABEL: Record<string, string> = {
  pending: "審核中",
  approved: "已核准",
  rejected: "已駁回",
  returned: "已退回待修改",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600",
  approved: "text-green-600",
  rejected: "text-destructive",
  returned: "text-amber-700",
};

// 目前輪到哪一關：從 approvalRecords 找第一個還在 waiting 的關卡標籤，
// 讓申請人不用點進明細就知道卡在哪。退回後其他關卡可能還留著舊的 waiting 紀錄(重新
// 送出前不會去動它)，所以要先判斷 returned/approved/rejected 這幾個終止狀態，
// 不然會誤判成「還在等某一關簽核」。
function currentStageLabel(app: ApplicationListItem): string {
  if (app.status === "approved") return "已全部核准";
  if (app.status === "rejected") return "已駁回";
  if (app.status === "returned") return `已被「${app.returnedByStageLabel}」退回`;
  const waiting = app.approvalRecords.find((r) => r.status === "waiting");
  return waiting ? `等待「${waiting.stage.label}」簽核` : "-";
}

export function MyApplications({ auth, onEdit }: { auth: AuthState; onEdit?: (applicationId: string) => void }) {
  const isAdmin = auth.user.role === "admin";
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", auth.user.companyId, scope],
    queryFn: () =>
      apiFetch<ApplicationListItem[]>(`/companies/${auth.user.companyId}/applications?scope=${scope}`, {
        token: auth.token,
      }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{scope === "mine" ? "我的申請" : "全部申請"}</h2>
        {isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" variant={scope === "mine" ? "default" : "outline"} onClick={() => setScope("mine")}>
              我的申請
            </Button>
            <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>
              全部申請(admin)
            </Button>
          </div>
        )}
      </div>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}
      {data && data.length === 0 && <div className="p-8 text-center text-muted-foreground">目前沒有任何申請單</div>}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {scope === "all" && <TableHead>申請人</TableHead>}
              <TableHead>部門</TableHead>
              <TableHead>申請日期</TableHead>
              <TableHead>金額</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((app) => {
              const expanded = expandedId === app.id;
              return (
                <Fragment key={app.id}>
                  <TableRow>
                    {scope === "all" && <TableCell>{app.applicant.name}</TableCell>}
                    <TableCell>{app.department.name}</TableCell>
                    <TableCell>{new Date(app.applicationDate).toLocaleDateString("zh-TW")}</TableCell>
                    <TableCell>{app.totalAmountTWD}</TableCell>
                    <TableCell className={STATUS_COLOR[app.status] ?? ""}>
                      {STATUS_LABEL[app.status] ?? app.status}
                      <div className="text-xs text-muted-foreground">{currentStageLabel(app)}</div>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : app.id)}>
                        {expanded ? "收合" : "查看明細"}
                      </Button>
                      {scope === "mine" && app.status === "returned" && onEdit && (
                        <Button size="sm" onClick={() => onEdit(app.id)}>
                          編輯並重新送出
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow>
                      <TableCell colSpan={scope === "all" ? 6 : 5} className="p-0">
                        <ApplicationDetail auth={auth} applicationId={app.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
