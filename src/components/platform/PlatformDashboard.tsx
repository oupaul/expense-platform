import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { CompanySummary } from "@/types/platform";

const emptyForm = { slug: "", name: "", nameEn: "", adminName: "", adminEmail: "", adminPassword: "" };

export function PlatformDashboard({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["platform", "companies"];
  const [form, setForm] = useState(emptyForm);
  const [createdInfo, setCreatedInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ companyId: string; userId: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<CompanySummary[]>("/platform/companies", { token }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ slug: string; admin: { email: string } }>("/platform/companies", {
        method: "POST",
        token,
        body: { ...form, nameEn: form.nameEn || undefined },
      }),
    onSuccess: (created) => {
      setForm(emptyForm);
      setError(null);
      setCreatedInfo(`租戶「${created.slug}」建立成功，管理員帳號：${created.admin.email}，請自行告知客戶密碼。`);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "建立失敗"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<CompanySummary, "name" | "nameEn" | "slug" | "active">> }) =>
      apiFetch(`/platform/companies/${id}`, { method: "PUT", token, body: patch }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "更新失敗"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ companyId, userId, newPassword }: { companyId: string; userId: string; newPassword: string }) =>
      apiFetch(`/platform/companies/${companyId}/admins/${userId}/reset-password`, {
        method: "POST",
        token,
        body: { newPassword },
      }),
    onSuccess: () => {
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "重設失敗"),
  });

  const canSubmit =
    form.slug.trim() && form.name.trim() && form.adminName.trim() && form.adminEmail.trim() && form.adminPassword.length >= 8;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-xl font-bold">租戶管理</h1>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}
      {data && data.length === 0 && <div className="p-8 text-center text-muted-foreground">目前還沒有任何租戶</div>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>租戶代號</TableHead>
              <TableHead>公司名稱</TableHead>
              <TableHead>英文名稱</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>使用者/申請單數</TableHead>
              <TableHead>管理員</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Input
                    className="w-28 font-mono"
                    defaultValue={c.slug}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== c.slug) updateMutation.mutate({ id: c.id, patch: { slug: value } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="w-32"
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== c.name) updateMutation.mutate({ id: c.id, patch: { name: value } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="w-32"
                    defaultValue={c.nameEn ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== (c.nameEn ?? "")) updateMutation.mutate({ id: c.id, patch: { nameEn: value } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant={c.active ? "destructive" : "outline"}
                    onClick={() => updateMutation.mutate({ id: c.id, patch: { active: !c.active } })}
                  >
                    {c.active ? "停用" : "重新啟用"}
                  </Button>
                  <div className={`mt-1 text-xs ${c.active ? "text-green-600" : "text-muted-foreground"}`}>
                    {c.active ? "啟用中" : "已停用"}
                  </div>
                </TableCell>
                <TableCell>
                  {c.userCount} / {c.applicationCount}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {c.admins.length === 0 && <span className="text-xs text-muted-foreground">無 admin 帳號</span>}
                    {c.admins.map((admin) => (
                      <div key={admin.id} className="text-xs">
                        <div>{admin.email}</div>
                        {resetTarget?.companyId === c.id && resetTarget.userId === admin.id ? (
                          <span className="inline-flex items-center gap-1">
                            <Input
                              className="inline-block h-7 w-28 text-xs"
                              placeholder="新密碼(至少8碼)"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                            />
                            <Button
                              size="sm"
                              className="h-7"
                              disabled={resetPassword.length < 8}
                              onClick={() => resetPasswordMutation.mutate({ companyId: c.id, userId: admin.id, newPassword: resetPassword })}
                            >
                              確認
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setResetTarget({ companyId: c.id, userId: admin.id });
                              setResetPassword("");
                            }}
                          >
                            重設密碼
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="space-y-3 rounded border p-4">
        <h2 className="font-semibold">新增租戶</h2>
        <p className="text-xs text-muted-foreground">
          只建立公司本身跟第一個管理員帳號；部門、費用項目、簽核關卡等設定，請客戶自己登入後台設定。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>租戶代號(網址用，例如 acme)</Label>
            <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} placeholder="acme" />
          </div>
          <div>
            <Label>公司名稱</Label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label>英文名稱(選填)</Label>
            <Input value={form.nameEn} onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))} />
          </div>
          <div />
          <div>
            <Label>管理員姓名</Label>
            <Input value={form.adminName} onChange={(e) => setForm((p) => ({ ...p, adminName: e.target.value }))} />
          </div>
          <div>
            <Label>管理員 Email</Label>
            <Input
              value={form.adminEmail}
              onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
              type="email"
            />
          </div>
          <div className="col-span-2">
            <Label>管理員初始密碼(至少 8 碼)</Label>
            <Input
              value={form.adminPassword}
              onChange={(e) => setForm((p) => ({ ...p, adminPassword: e.target.value }))}
            />
          </div>
        </div>
        {createdInfo && <p className="text-sm text-green-600">{createdInfo}</p>}
        <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending ? "建立中…" : "建立租戶"}
        </Button>
      </div>
    </div>
  );
}
