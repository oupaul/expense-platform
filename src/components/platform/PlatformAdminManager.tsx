import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { PlatformAdminItem } from "@/types/platform";

const emptyForm = { name: "", email: "", password: "" };

export function PlatformAdminManager({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["platform", "admins"];
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<PlatformAdminItem[]>("/platform/admins", { token }),
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/platform/admins", { method: "POST", token, body: form }),
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "建立失敗"),
  });

  const canSubmit = form.name.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-xl font-bold">平台管理者</h1>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>建立時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell>{admin.name}</TableCell>
                <TableCell>{admin.email}</TableCell>
                <TableCell className={admin.active ? "text-green-600" : "text-muted-foreground"}>
                  {admin.active ? "啟用中" : "已停用"}
                </TableCell>
                <TableCell>{new Date(admin.createdAt).toLocaleDateString("zh-TW")}</TableCell>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending ? "建立中…" : "新增平台管理者"}
        </Button>
      </div>
    </div>
  );
}
