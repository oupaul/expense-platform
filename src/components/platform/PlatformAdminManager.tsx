import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { PlatformAdminItem } from "@/types/platform";

const emptyForm = { name: "", email: "", password: "" };

export function PlatformAdminManager({ token, currentAdminId }: { token: string; currentAdminId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["platform", "admins"];
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<PlatformAdminItem[]>("/platform/admins", { token }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/platform/admins", { method: "POST", token, body: form }),
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "建立失敗"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<PlatformAdminItem, "name" | "email" | "active">> }) =>
      apiFetch(`/platform/admins/${id}`, { method: "PUT", token, body: patch }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "更新失敗"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiFetch(`/platform/admins/${id}/reset-password`, { method: "POST", token, body: { newPassword } }),
    onSuccess: () => {
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "重設失敗"),
  });

  const canSubmit = form.name.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-xl font-bold">平台管理者</h1>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell>
                  <Input
                    className="w-32"
                    defaultValue={admin.name}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== admin.name) updateMutation.mutate({ id: admin.id, patch: { name: value } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="w-48"
                    type="email"
                    defaultValue={admin.email}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== admin.email) updateMutation.mutate({ id: admin.id, patch: { email: value } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant={admin.active ? "destructive" : "outline"}
                    disabled={admin.id === currentAdminId}
                    onClick={() => updateMutation.mutate({ id: admin.id, patch: { active: !admin.active } })}
                  >
                    {admin.active ? "停用" : "重新啟用"}
                  </Button>
                  <div className={`mt-1 text-xs ${admin.active ? "text-green-600" : "text-muted-foreground"}`}>
                    {admin.active ? "啟用中" : "已停用"}
                  </div>
                </TableCell>
                <TableCell>
                  {resetTarget === admin.id ? (
                    <span className="inline-flex items-center gap-1">
                      <Input
                        className="inline-block w-32"
                        placeholder="新密碼(至少8碼)"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                      />
                      <Button
                        size="sm"
                        disabled={resetPassword.length < 8}
                        onClick={() => resetPasswordMutation.mutate({ id: admin.id, newPassword: resetPassword })}
                      >
                        確認
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResetTarget(admin.id);
                        setResetPassword("");
                      }}
                    >
                      重設密碼
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="space-y-3 rounded border p-4">
        <h2 className="font-semibold">新增平台管理者</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>姓名</Label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} type="email" />
          </div>
          <div className="col-span-2">
            <Label>初始密碼(至少 8 碼)</Label>
            <Input value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          </div>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending ? "建立中…" : "新增平台管理者"}
        </Button>
      </div>
    </div>
  );
}
