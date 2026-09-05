import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ApprovalStageItem } from "@/types/admin";

export function ApprovalStageManager({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "approval-stages", auth.user.companyId];
  const basePath = `/companies/${auth.user.companyId}/approval-stages`;
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<ApprovalStageItem[]>(basePath, { token: auth.token }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "操作失敗");

  const createMutation = useMutation({
    mutationFn: () => apiFetch(basePath, { method: "POST", token: auth.token, body: { roleKey: newRoleKey, label: newLabel } }),
    onSuccess: () => {
      setNewRoleKey("");
      setNewLabel("");
      invalidate();
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<ApprovalStageItem, "roleKey" | "label">> }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: patch }),
    onSuccess: invalidate,
    onError,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active
        ? apiFetch(`${basePath}/${id}`, { method: "DELETE", token: auth.token })
        : apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { active: true } }),
    onSuccess: invalidate,
    onError,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch(`${basePath}/reorder`, { method: "PUT", token: auth.token, body: { orderedIds } }),
    onSuccess: invalidate,
    onError,
  });

  const move = (index: number, direction: -1 | 1) => {
    if (!data) return;
    const target = index + direction;
    if (target < 0 || target >= data.length) return;
    const ids = data.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">簽核關卡</h3>
      <p className="text-xs text-muted-foreground">
        角色代號要對應實際的使用者角色(User.role)，例如 dept_manager、finance、ceo，簽核 API 就是靠這個比對輪到誰簽。
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>順序</TableHead>
            <TableHead>角色代號</TableHead>
            <TableHead>顯示標籤</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">尚未設定簽核關卡</TableCell>
            </TableRow>
          )}
          {data.map((stage, i) => (
            <TableRow key={stage.id}>
              <TableCell className="space-x-1">
                <Button size="sm" variant="outline" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                <Button size="sm" variant="outline" disabled={i === data.length - 1} onClick={() => move(i, 1)}>↓</Button>
              </TableCell>
              <TableCell>
                <Input
                  defaultValue={stage.roleKey}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== stage.roleKey) updateMutation.mutate({ id: stage.id, patch: { roleKey: value } });
                  }}
                />
              </TableCell>
              <TableCell>
                <Input
                  defaultValue={stage.label}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== stage.label) updateMutation.mutate({ id: stage.id, patch: { label: value } });
                  }}
                />
              </TableCell>
              <TableCell className={stage.active ? "text-green-600" : "text-muted-foreground"}>
                {stage.active ? "啟用中" : "已停用"}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant={stage.active ? "destructive" : "outline"}
                  onClick={() => toggleActiveMutation.mutate({ id: stage.id, active: stage.active })}
                >
                  {stage.active ? "停用" : "重新啟用"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex gap-2">
        <Input value={newRoleKey} onChange={(e) => setNewRoleKey(e.target.value)} placeholder="角色代號，例如 ceo" />
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="顯示標籤，例如 執行長核准" />
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !newRoleKey.trim() || !newLabel.trim()}
        >
          新增關卡(加在最後)
        </Button>
      </div>
    </div>
  );
}
