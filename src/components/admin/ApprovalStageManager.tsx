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
import type { ApprovalStageItem } from "@/types/admin";

export function ApprovalStageManager({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "approval-stages", auth.user.companyId];
  const basePath = `/companies/${auth.user.companyId}/approval-stages`;
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!data || !over || active.id === over.id) return;
    const oldIndex = data.findIndex((s) => s.id === active.id);
    const newIndex = data.findIndex((s) => s.id === over.id);
    reorderMutation.mutate(arrayMove(data, oldIndex, newIndex).map((s) => s.id));
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">簽核關卡</h3>
      <p className="text-xs text-muted-foreground">
        角色代號要對應實際的使用者角色(User.role)，例如 dept_manager、finance、ceo，簽核 API 就是靠這個比對輪到誰簽。
        拖曳最左邊的把手可以調整簽核順序。
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {/* DndContext 會渲染無障礙提示用的 <div>，一定要包在 <Table> 外面，
          不能放進 <TableBody>(也就是 <tbody>)裡——<div> 不是 <tbody> 的合法子元素，
          瀏覽器會把它搬到別的地方，dnd-kit 量測 DOM 位置就會算錯，拖曳/鍵盤移動因此失效。 */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
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
            <SortableContext items={data.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {data.map((stage) => (
                <SortableTableRow key={stage.id} id={stage.id}>
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
                </SortableTableRow>
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>
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
