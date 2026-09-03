import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { OptionItem } from "@/types/admin";

interface Props {
  auth: AuthState;
  resourcePath: "departments" | "expense-categories" | "expense-natures";
  title: string;
}

// Department / ExpenseCategory / ExpenseNature 後台管理邏輯完全一樣，
// 用同一個元件依 resourcePath 打對應的 API，對應後端 optionResource.ts 的工廠設計。
export function OptionManager({ auth, resourcePath, title }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", resourcePath, auth.user.companyId];
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const basePath = `/companies/${auth.user.companyId}/${resourcePath}`;

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<OptionItem[]>(basePath, { token: auth.token }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiFetch(basePath, { method: "POST", token: auth.token, body: { name } }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "新增失敗"),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { name } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "更新失敗"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active
        ? apiFetch(`${basePath}/${id}`, { method: "DELETE", token: auth.token })
        : apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { active: true } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "更新失敗"),
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名稱</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                尚未設定任何項目
              </TableCell>
            </TableRow>
          )}
          {data.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Input
                  defaultValue={item.name}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== item.name) renameMutation.mutate({ id: item.id, name: value });
                  }}
                />
              </TableCell>
              <TableCell>
                <span className={item.active ? "text-green-600" : "text-muted-foreground"}>
                  {item.active ? "啟用中" : "已停用"}
                </span>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant={item.active ? "destructive" : "outline"}
                  onClick={() => toggleActiveMutation.mutate({ id: item.id, active: item.active })}
                >
                  {item.active ? "停用" : "重新啟用"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`新增${title}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim());
          }}
        />
        <Button
          onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
          disabled={createMutation.isPending || !newName.trim()}
        >
          新增
        </Button>
      </div>
    </div>
  );
}
