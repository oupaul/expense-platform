import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ApplicationListItem } from "@/types/application";
import { Fragment, useState } from "react";
import { ApplicationDetail } from "@/components/ApplicationDetail";
import { SignaturePad } from "@/components/SignaturePad";

export function PendingApprovals({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  // 每張申請單各自的簽核簽名，用 id 存放；核准/駁回前一定要先簽名。
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", auth.user.companyId, "pending"],
    queryFn: () =>
      apiFetch<ApplicationListItem[]>(`/companies/${auth.user.companyId}/applications?scope=pending`, {
        token: auth.token,
      }),
  });

  const decide = async (id: string, action: "approve" | "reject") => {
    const signatureImage = signatures[id];
    if (!signatureImage) {
      setActionError("請先簽名再核准或駁回");
      return;
    }
    setActionError(null);
    setDecidingId(id);
    try {
      await apiFetch(`/companies/${auth.user.companyId}/applications/${id}/decision`, {
        method: "POST",
        token: auth.token,
        body: { action, signatureImage },
      });
      queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] });
      setSignatures((prev) => ({ ...prev, [id]: null }));
      setExpandedId(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "操作失敗");
    } finally {
      setDecidingId(null);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入待簽核清單中…</div>;
  if (isError) return <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>;
  if (!data || data.length === 0) return <div className="p-8 text-center text-muted-foreground">目前沒有待你簽核的申請單</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <h2 className="text-lg font-bold">待簽核清單({auth.user.role})</h2>
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      <Table>
        <TableHeader>
          <TableRow>
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
                  <TableCell>{app.applicant.name}</TableCell>
                  <TableCell>{app.department.name}</TableCell>
                  <TableCell>{new Date(app.applicationDate).toLocaleDateString("zh-TW")}</TableCell>
                  <TableCell>{app.purpose ?? "-"}</TableCell>
                  <TableCell>{app.totalAmountTWD}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : app.id)}>
                      {expanded ? "收合" : "查看明細並簽核"}
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <ApplicationDetail auth={auth} applicationId={app.id} />
                      <div className="space-y-3 border-t bg-slate-50 p-4">
                        <SignaturePad
                          value={signatures[app.id] ?? null}
                          onChange={(v) => setSignatures((prev) => ({ ...prev, [app.id]: v }))}
                          label="簽核簽名(核准或駁回前必填)"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={decidingId === app.id || !signatures[app.id]} onClick={() => decide(app.id, "approve")}>
                            核准
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
    </div>
  );
}
