import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { OptionItem, ApprovalStageItem } from "@/types/admin";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  active: boolean;
}

export function UserManager({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const basePath = `/companies/${auth.user.companyId}/users`;
  const queryKey = ["admin", "users", auth.user.companyId];
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [newUser, setNewUser] = useState({ name: "", email: "", role: "applicant", departmentId: "", password: "" });

  const { data: users, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<UserItem[]>(basePath, { token: auth.token }),
  });
  const { data: departments } = useQuery({
    queryKey: ["admin", "departments", auth.user.companyId],
    queryFn: () => apiFetch<OptionItem[]>(`/companies/${auth.user.companyId}/departments`, { token: auth.token }),
  });
  const { data: stages } = useQuery({
    queryKey: ["admin", "approval-stages", auth.user.companyId],
    queryFn: () => apiFetch<ApprovalStageItem[]>(`/companies/${auth.user.companyId}/approval-stages`, { token: auth.token }),
  });

  const roleOptions = ["admin", "applicant", ...new Set((stages ?? []).map((s) => s.roleKey))];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "操作失敗");

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch(basePath, {
        method: "POST",
        token: auth.token,
        body: { ...newUser, departmentId: newUser.departmentId || undefined },
      }),
    onSuccess: () => {
      setNewUser({ name: "", email: "", role: "applicant", departmentId: "", password: "" });
      invalidate();
    },
    onError,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { active } }),
    onSuccess: invalidate,
    onError,
  });

  // 角色/姓名/Email/部門都是同一支 PUT /:id 在改，共用一個 mutation 就好，
  // 不用每個欄位各開一個(改一個欄位要加一次 mutation 太瑣碎)。
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<UserItem, "name" | "email" | "role" | "departmentId">> }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: patch }),
    onSuccess: invalidate,
    onError,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiFetch(`${basePath}/${id}/reset-password`, { method: "POST", token: auth.token, body: { newPassword } }),
    onSuccess: () => {
      setResetTarget(null);
      setResetPassword("");
    },
    onError,
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !users) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">使用者帳號</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>姓名</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>部門</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Input
                  className="w-32"
                  defaultValue={u.name}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== u.name) updateMutation.mutate({ id: u.id, patch: { name: value } });
                  }}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="w-48"
                  type="email"
                  defaultValue={u.email}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== u.email) updateMutation.mutate({ id: u.id, patch: { email: value } });
                  }}
                />
              </TableCell>
              <TableCell>
                <Select
                  value={u.departmentId ?? "__none__"}
                  onValueChange={(v) => updateMutation.mutate({ id: u.id, patch: { departmentId: v === "__none__" ? null : v } })}
                >
                  <SelectTrigger className="w-32"><SelectValue placeholder="不指定" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不指定</SelectItem>
                    {(departments ?? []).filter((d) => d.active).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select value={u.role} onValueChange={(role) => updateMutation.mutate({ id: u.id, patch: { role } })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className={u.active ? "text-green-600" : "text-muted-foreground"}>
                {u.active ? "啟用中" : "已停用"}
              </TableCell>
              <TableCell className="space-x-2">
                <Button
                  size="sm"
                  variant={u.active ? "destructive" : "outline"}
                  disabled={u.id === auth.user.id}
                  onClick={() => toggleActiveMutation.mutate({ id: u.id, active: !u.active })}
                >
                  {u.active ? "停用" : "重新啟用"}
                </Button>
                {resetTarget === u.id ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      className="inline-block w-32"
                      placeholder="新密碼(至少8碼)"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() => resetPasswordMutation.mutate({ id: u.id, newPassword: resetPassword })}
                      disabled={resetPassword.length < 8}
                    >
                      確認
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setResetTarget(u.id)}>
                    重設密碼
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid grid-cols-2 gap-3 rounded border p-4">
        <div>
          <Label>姓名</Label>
          <Input value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} type="email" />
        </div>
        <div>
          <Label>角色</Label>
          <Select value={newUser.role} onValueChange={(role) => setNewUser((p) => ({ ...p, role }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>部門(選填)</Label>
          <Select value={newUser.departmentId} onValueChange={(departmentId) => setNewUser((p) => ({ ...p, departmentId }))}>
            <SelectTrigger><SelectValue placeholder="不指定" /></SelectTrigger>
            <SelectContent>
              {(departments ?? []).filter((d) => d.active).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>初始密碼(至少 8 碼)</Label>
          <Input value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} type="text" />
        </div>
        <Button
          className="col-span-2"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !newUser.name || !newUser.email || newUser.password.length < 8}
        >
          新增使用者
        </Button>
      </div>
    </div>
  );
}
