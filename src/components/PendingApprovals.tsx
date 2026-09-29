import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/utils";
import type { AuthState } from "@/types/auth";
import type { ApplicationListItem } from "@/types/application";
import { Fragment, useState } from "react";
import { ApplicationDetail } from "@/components/ApplicationDetail";
import { SignaturePad } from "@/components/SignaturePad";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type DecisionAction = "approve" | "reject" | "return";

const STATUS_LABEL: Record<string, string> = {
  pending: "審核中",
  approved: "已核准",
  rejected: "已駁回",
  returned: "已退回待修改",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600",
  approved: "text-green-600",
  rejected: "text-destructive",
  returned: "text-amber-700",
  cancelled: "text-muted-foreground",
};

// 已簽核清單：這個人自己實際簽過的申請單，不限於「目前還輪到我」——一旦簽過，不管
// 後面走到哪一關、最後結果是什麼，都會留在這裡，讓簽核者能回頭查自己簽過什麼。
// 跟「待簽核」共用一個元件檔案，是因為兩者共用同一套 auth/queryClient，拆成兩個檔案
// 反而要多傳一堆 props，不如放在同一個元件裡用分頁切換。
function ReviewedList({ auth }: { auth: AuthState }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", auth.user.companyId, "reviewed"],
    queryFn: () =>
      apiFetch<ApplicationListItem[]>(`/companies/${auth.user.companyId}/applications?scope=reviewed`, {
        token: auth.token,
      }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入已簽核清單中…</div>;
  if (isError) return <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>;
  if (!data || data.length === 0) return <div className="p-8 text-center text-muted-foreground">目前沒有你簽過的申請單</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>編號</TableHead>
          <TableHead>申請人</TableHead>
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
                <TableCell className="font-mono text-xs">{app.applicationNumber ?? "-"}</TableCell>
                <TableCell>{app.applicant.name}</TableCell>
                <TableCell>{app.department?.name ?? "-"}</TableCell>
                <TableCell>{app.applicationDate ? new Date(app.applicationDate).toLocaleDateString("zh-TW") : "-"}</TableCell>
                <TableCell>{formatAmount(Math.round(Number(app.totalAmountTWD)))}</TableCell>
                <TableCell className={STATUS_COLOR[app.status] ?? ""}>{STATUS_LABEL[app.status] ?? app.status}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : app.id)}>
                    {expanded ? "收合" : "查看明細"}
                  </Button>
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <ApplicationDetail auth={auth} applicationId={app.id} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function PendingApprovals({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  // 每張申請單各自的簽核簽名/備註，用 id 存放；核准/駁回/退回前一定要先簽名，退回一定要填備註。
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", auth.user.companyId, "pending"],
    queryFn: () =>
      apiFetch<ApplicationListItem[]>(`/companies/${auth.user.companyId}/applications?scope=pending`, {
        token: auth.token,
      }),
  });

  const decide = async (id: string, action: DecisionAction) => {
    const signatureImage = signatures[id];
    if (!signatureImage) {
      setActionError("請先簽名再核准/駁回/退回");
      return;
    }
    const comment = comments[id]?.trim();
    if (action === "return" && !comment) {
      setActionError("退回時請填寫備註說明，讓申請人知道要修改什麼");
      return;
    }
    setActionError(null);
    setDecidingId(id);
    try {
      await apiFetch(`/companies/${auth.user.companyId}/applications/${id}/decision`, {
        method: "POST",
        token: auth.token,
        body: { action, signatureImage, comment: comment || undefined },
      });
      queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] });
      setSignatures((prev) => ({ ...prev, [id]: null }));
      setComments((prev) => ({ ...prev, [id]: "" }));
      setExpandedId(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "操作失敗");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{tab === "pending" ? `待簽核清單(${auth.user.role})` : "已簽核清單"}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>
            待簽核
          </Button>
          <Button size="sm" variant={tab === "reviewed" ? "default" : "outline"} onClick={() => setTab("reviewed")}>
            已簽核
          </Button>
        </div>
      </div>

      {tab === "reviewed" ? (
        <ReviewedList auth={auth} />
      ) : (
        <>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          {isLoading && <div className="p-8 text-center text-muted-foreground">載入待簽核清單中…</div>}
          {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}
          {!isLoading && !isError && (!data || data.length === 0) && (
            <div className="p-8 text-center text-muted-foreground">目前沒有待你簽核的申請單</div>
          )}
          {data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>編號</TableHead>
                  <TableHead>申請人</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>申請日期</TableHead>
                  <TableHead>用途</TableHead>
                  <TableHead>金額</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((app) => {
                  const expanded = expandedId === app.id;
                  return (
                    <Fragment key={app.id}>
                      <TableRow>
                        <TableCell className="font-mono text-xs">{app.applicationNumber ?? "-"}</TableCell>
                        <TableCell>{app.applicant.name}</TableCell>
                        <TableCell>{app.department.name}</TableCell>
                        <TableCell>{new Date(app.applicationDate).toLocaleDateString("zh-TW")}</TableCell>
                        <TableCell>{app.purpose ?? "-"}</TableCell>
                        <TableCell>{formatAmount(Math.round(Number(app.totalAmountTWD)))}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : app.id)}>
                            {expanded ? "收合" : "查看明細並簽核"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="p-0">
                            <ApplicationDetail auth={auth} applicationId={app.id} />
                            <div className="space-y-3 border-t bg-slate-50 p-4">
                              <div>
                                <Label htmlFor={`comment-${app.id}`}>
                                  備註說明(按「退回補件」<span className="text-destructive">一定要先填這欄</span>，核准/駁回則選填)
                                </Label>
                                <Textarea
                                  id={`comment-${app.id}`}
                                  value={comments[app.id] ?? ""}
                                  onChange={(e) => setComments((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                  placeholder="要退回的話，請說明申請人需要修改的地方"
                                />
                              </div>
                              <SignaturePad
                                value={signatures[app.id] ?? null}
                                onChange={(v) => setSignatures((prev) => ({ ...prev, [app.id]: v }))}
                                label="簽核簽名(核准/駁回/退回前必填)"
                                auth={auth}
                              />
                              {expandedId === app.id && actionError && (
                                <p className="text-sm font-medium text-destructive">{actionError}</p>
                              )}
                              <div className="flex gap-2">
                                <Button size="sm" disabled={decidingId === app.id || !signatures[app.id]} onClick={() => decide(app.id, "approve")}>
                                  核准
                                </Button>
                                {/* 退回按鈕不因為備註沒填就整個反灰——反灰會讓人以為按鈕壞掉，
                                    改成點下去才用 decide() 裡的檢查跳出明確訊息，跟簽名的檢查方式一致。 */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={decidingId === app.id || !signatures[app.id]}
                                  onClick={() => decide(app.id, "return")}
                                >
                                  退回補件
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={decidingId === app.id || !signatures[app.id]}
                                  onClick={() => decide(app.id, "reject")}
                                >
                                  駁回
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
