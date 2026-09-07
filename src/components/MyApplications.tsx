import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/utils";
import type { AuthState } from "@/types/auth";
import type { ApplicationListItem } from "@/types/application";
import { ApplicationDetail } from "@/components/ApplicationDetail";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "審核中",
  approved: "已核准",
  rejected: "已駁回",
  returned: "已退回待修改",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "text-muted-foreground",
  pending: "text-amber-600",
  approved: "text-green-600",
  rejected: "text-destructive",
  returned: "text-amber-700",
  cancelled: "text-muted-foreground",
};

// 目前輪到哪一關：從 approvalRecords 找第一個還在 waiting 的關卡標籤，
// 讓申請人不用點進明細就知道卡在哪。退回後其他關卡可能還留著舊的 waiting 紀錄(重新
// 送出前不會去動它)，所以要先判斷 returned/approved/rejected 這幾個終止狀態，
// 不然會誤判成「還在等某一關簽核」。草稿還沒進入簽核流程，approvalRecords 本來就是空的。
function currentStageLabel(app: ApplicationListItem): string {
  if (app.status === "draft") return "尚未送出";
  if (app.status === "approved") return "已全部核准";
  if (app.status === "rejected") return "已駁回";
  if (app.status === "returned") return `已被「${app.returnedByStageLabel}」退回`;
  if (app.status === "cancelled") return "申請人已自行取消";
  const waiting = app.approvalRecords.find((r) => r.status === "waiting");
  return waiting ? `等待「${waiting.stage.label}」簽核` : "-";
}

export function MyApplications({ auth, onEdit }: { auth: AuthState; onEdit?: (applicationId: string) => void }) {
  // admin 或被個別指定 canViewAllReports 的人都能切到「全部申請」，跟報表分頁用同一組權限判斷。
  const canViewAll = auth.user.role === "admin" || auth.user.canViewAllReports;
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", auth.user.companyId, scope],
    queryFn: () =>
      apiFetch<ApplicationListItem[]>(`/companies/${auth.user.companyId}/applications?scope=${scope}`, {
        token: auth.token,
      }),
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const deleteDraftMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/companies/${auth.user.companyId}/applications/${id}/draft`, { method: "DELETE", token: auth.token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] }),
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "刪除失敗"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/companies/${auth.user.companyId}/applications/${id}/cancel`, { method: "POST", token: auth.token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] }),
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "取消失敗"),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{scope === "mine" ? "我的申請" : "全部申請"}</h2>
        {canViewAll && (
          <div className="flex gap-2">
            <Button size="sm" variant={scope === "mine" ? "default" : "outline"} onClick={() => setScope("mine")}>
              我的申請
            </Button>
            <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>
              全部申請
            </Button>
          </div>
        )}
      </div>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {data && data.length === 0 && <div className="p-8 text-center text-muted-foreground">目前沒有任何申請單</div>}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>編號</TableHead>
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
              const isDraft = app.status === "draft";
              return (
                <Fragment key={app.id}>
                  <TableRow>
                    <TableCell className="font-mono text-xs">{app.applicationNumber ?? "-"}</TableCell>
                    {scope === "all" && <TableCell>{app.applicant.name}</TableCell>}
                    <TableCell>{app.department?.name ?? "-"}</TableCell>
                    <TableCell>{app.applicationDate ? new Date(app.applicationDate).toLocaleDateString("zh-TW") : "-"}</TableCell>
                    <TableCell>{formatAmount(Math.round(Number(app.totalAmountTWD)))}</TableCell>
                    <TableCell className={STATUS_COLOR[app.status] ?? ""}>
                      {STATUS_LABEL[app.status] ?? app.status}
                      <div className="text-xs text-muted-foreground">{currentStageLabel(app)}</div>
                    </TableCell>
                    <TableCell className="space-x-2">
                      {/* 草稿還沒真的送出，直接給「繼續編輯」/「刪除」，不提供「查看明細」——
                          內容本來就不完整，用跟已送出申請單一樣的唯讀明細畫面意義不大。 */}
                      {isDraft ? (
                        <>
                          {scope === "mine" && onEdit && (
                            <Button size="sm" onClick={() => onEdit(app.id)}>
                              繼續編輯
                            </Button>
                          )}
                          {scope === "mine" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleteDraftMutation.isPending}
                              onClick={() => {
                                setActionError(null);
                                deleteDraftMutation.mutate(app.id);
                              }}
                            >
                              刪除
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : app.id)}>
                            {expanded ? "收合" : "查看明細"}
                          </Button>
                          {scope === "mine" && app.status === "returned" && onEdit && (
                            <Button size="sm" onClick={() => onEdit(app.id)}>
                              編輯並重新送出
                            </Button>
                          )}
                          {/* 只有本人的申請單、還在「審核中」或「已退回」這兩種還沒走到終局的
                              狀態才能取消——已核准/已駁回是終局狀態，草稿走 DELETE .../draft
                              那條刪除的路，不會走到這個分支(isDraft 已經在上面另外處理掉)。 */}
                          {app.applicantId === auth.user.id && (app.status === "pending" || app.status === "returned") && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={cancelMutation.isPending}
                              onClick={() => {
                                setActionError(null);
                                cancelMutation.mutate(app.id);
                              }}
                            >
                              取消申請
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded && !isDraft && (
                    <TableRow>
                      <TableCell colSpan={scope === "all" ? 7 : 6} className="p-0">
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
