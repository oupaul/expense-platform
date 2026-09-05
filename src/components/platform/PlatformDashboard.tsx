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

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<CompanySummary[]>("/platform/companies", { token }),
  });

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
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "建立失敗"),
  });

  const canSubmit =
    form.slug.trim() && form.name.trim() && form.adminName.trim() && form.adminEmail.trim() && form.adminPassword.length >= 8;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-xl font-bold">租戶管理</h1>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}
      {data && data.length === 0 && <div className="p-8 text-center text-muted-foreground">目前還沒有任何租戶</div>}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>租戶代號</TableHead>
              <TableHead>公司名稱</TableHead>
              <TableHead>建立時間</TableHead>
              <TableHead>使用者數</TableHead>
              <TableHead>申請單數</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.slug}</TableCell>
                <TableCell>
                  {c.name}
                  {c.nameEn && <div className="text-xs text-muted-foreground">{c.nameEn}</div>}
                </TableCell>
                <TableCell>{new Date(c.createdAt).toLocaleDateString("zh-TW")}</TableCell>
                <TableCell>{c.userCount}</TableCell>
                <TableCell>{c.applicationCount}</TableCell>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending ? "建立中…" : "建立租戶"}
        </Button>
      </div>
    </div>
  );
}
