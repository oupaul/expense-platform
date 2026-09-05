import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableRow } from "@/components/admin/SortableTableRow";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { OptionItem } from "@/types/admin";

interface Props {
  auth: AuthState;
  resourcePath: "departments" | "expense-categories" | "expense-natures";
  title: string;
  // 只有「費用項目」需要這個開關：選到這個類別時，費用明細列的專案編號要變必填。
  showRequiresProjectCode?: boolean;
}

// Department / ExpenseCategory / ExpenseNature 後台管理邏輯完全一樣，
// 用同一個元件依 resourcePath 打對應的 API，對應後端 optionResource.ts 的工廠設計。
export function OptionManager({ auth, resourcePath, title, showRequiresProjectCode }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", resourcePath, auth.user.companyId];
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const basePath = `/companies/${auth.user.companyId}/${resourcePath}`;
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<OptionItem[]>(basePath, { token: auth.token }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "操作失敗");

  const createMutation = useMutation({
    mutationFn: (name: string) => apiFetch(basePath, { method: "POST", token: auth.token, body: { name } }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
    onError,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { name } }),
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

  const requiresProjectCodeMutation = useMutation({
    mutationFn: ({ id, requiresProjectCode }: { id: string; requiresProjectCode: boolean }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { requiresProjectCode } }),
    onSuccess: invalidate,
    onError,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch(`${basePath}/reorder`, { method: "PUT", token: auth.token, body: { orderedIds } }),
    onSuccess: invalidate,
    onError,
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!data || !over || active.id === over.id) return;
    const oldIndex = data.findIndex((item) => item.id === active.id);
    const newIndex = data.findIndex((item) => item.id === over.id);
    reorderMutation.mutate(arrayMove(data, oldIndex, newIndex).map((item) => item.id));
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  const columnCount = showRequiresProjectCode ? 5 : 4;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">拖曳最左邊的把手可以調整順序。</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {/* DndContext 會渲染無障礙提示用的 <div>，一定要包在 <Table> 外面，
          不能放進 <TableBody>(也就是 <tbody>)裡——<div> 不是 <tbody> 的合法子元素，
          瀏覽器會把它搬到別的地方，dnd-kit 量測 DOM 位置就會算錯，拖曳/鍵盤移動因此失效。 */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>名稱</TableHead>
              {showRequiresProjectCode && <TableHead>需要專案編號</TableHead>}
              <TableHead>狀態</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  尚未設定任何項目
                </TableCell>
              </TableRow>
            )}
            <SortableContext items={data.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              {data.map((item) => (
                <SortableTableRow key={item.id} id={item.id}>
                  <TableCell>
                    <Input
                      defaultValue={item.name}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value && value !== item.name) renameMutation.mutate({ id: item.id, name: value });
                      }}
                    />
                  </TableCell>
                  {showRequiresProjectCode && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={item.requiresProjectCode ?? false}
                        onChange={(e) =>
                          requiresProjectCodeMutation.mutate({ id: item.id, requiresProjectCode: e.target.checked })
                        }
                      />
                    </TableCell>
                  )}
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
                </SortableTableRow>
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>
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
