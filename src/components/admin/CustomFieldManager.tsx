import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SortableItem } from "@/components/admin/SortableItem";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { CustomFieldItem, CustomFieldOptionItem } from "@/types/admin";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const FIELD_TYPE_LABEL: Record<CustomFieldItem["fieldType"], string> = {
  text: "文字",
  date: "日期",
  select: "單選選單",
};

// 單一選項展開後的觸發欄位設定——選到這個選項時(例如「專案分類」的「ESCO」)，
// 要多顯示/要求填寫哪些「其他」自訂欄位(例如「CAPEX」)。獨立成一個元件才能各自
// 管理自己的 react-query(這個選項目前觸發了哪些欄位)跟本地編輯狀態，互不影響，
// 跟 CategoryCustomFieldLinks.tsx 的 CategoryLinksEditor 是同一種模式。
function OptionTriggerEditor({
  auth,
  option,
  candidateFields,
  onSaved,
}: {
  auth: AuthState;
  option: CustomFieldOptionItem;
  candidateFields: CustomFieldItem[];
  onSaved: () => void;
}) {
  const basePath = `/companies/${auth.user.companyId}/custom-fields/${option.customFieldId}/options/${option.id}/triggered-fields`;
  const [error, setError] = useState<string | null>(null);
  // { [customFieldId]: required } ——沒出現在這個物件裡代表沒勾選(不觸發)。
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "option-triggered-fields", option.id],
    queryFn: () => apiFetch<{ customFieldId: string; required: boolean }[]>(basePath, { token: auth.token }),
  });

  useEffect(() => {
    if (!data || loaded) return;
    setSelected(Object.fromEntries(data.map((l) => [l.customFieldId, l.required])));
    setLoaded(true);
  }, [data, loaded]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(basePath, {
        method: "PUT",
        token: auth.token,
        body: { links: Object.entries(selected).map(([customFieldId, required]) => ({ customFieldId, required })) },
      }),
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : "儲存失敗"),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">載入中…</p>;
  if (candidateFields.length === 0) {
    return <p className="text-xs text-muted-foreground">目前沒有其他已啟用的自訂欄位可以觸發，先到上面新增。</p>;
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-dashed p-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {candidateFields.map((field) => {
        const checked = field.id in selected;
        return (
          <div key={field.id} className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = { ...prev };
                    if (e.target.checked) next[field.id] = true;
                    else delete next[field.id];
                    return next;
                  })
                }
              />
              {field.name}
            </label>
            {checked && (
              <label className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={selected[field.id]}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                />
                必填
              </label>
            )}
          </div>
        );
      })}
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "儲存中…" : "儲存觸發設定"}
      </Button>
    </div>
  );
}

// select 型自訂欄位的選項管理，掛在某個自訂欄位底下展開顯示——跟後台其他清單
// (部門/費用類別)不同的地方是這裡不需要拖曳排序，選項通常沒幾個，用新增時的
// 順序就夠清楚，不值得為此多拉一套 dnd-kit 邏輯進來。
function CustomFieldOptions({ auth, field, allFields }: { auth: AuthState; field: CustomFieldItem; allFields: CustomFieldItem[] }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "custom-field-options", field.id];
  const basePath = `/companies/${auth.user.companyId}/custom-fields/${field.id}/options`;
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);
  // 候選欄位排除自己(選了 ESCO 又跳出「專案分類」本身沒有意義)跟已停用的欄位。
  const candidateFields = allFields.filter((f) => f.active && f.id !== field.id);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiFetch<CustomFieldOptionItem[]>(basePath, { token: auth.token }),
  });

  // 選項的新增/改名/停用會影響申請表單的下拉選單內容，company-config 那份快取
  // 也要一起 invalidate，理由跟 CategoryCustomFieldLinks 的 onSaved 一樣。
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["company-config", auth.user.companySlug] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "操作失敗");

  const createMutation = useMutation({
    mutationFn: (label: string) => apiFetch(basePath, { method: "POST", token: auth.token, body: { label } }),
    onSuccess: () => {
      setNewLabel("");
      invalidate();
    },
    onError,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      apiFetch(`${basePath}/${id}`, { method: "PUT", token: auth.token, body: { label } }),
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

  if (isLoading) return <p className="text-xs text-muted-foreground">載入選項中…</p>;

  return (
    <div className="mt-2 space-y-2 rounded border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">
        「{field.name}」的選項——每個選項可以再設定「選到這個選項時要多顯示哪些其他自訂欄位」，
        例如「ESCO」觸發顯示「CAPEX」、「OTR」觸發顯示「OPEX」，達到互斥的效果。
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {(data ?? []).map((opt) => (
        <div key={opt.id}>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 text-sm"
              defaultValue={opt.label}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== opt.label) renameMutation.mutate({ id: opt.id, label: value });
              }}
            />
            <span className={`text-xs ${opt.active ? "text-green-600" : "text-muted-foreground"}`}>
              {opt.active ? "啟用中" : "已停用"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpandedOptionId(expandedOptionId === opt.id ? null : opt.id)}
            >
              {expandedOptionId === opt.id ? "收合觸發設定" : "設定觸發欄位"}
            </Button>
            <Button
              size="sm"
              variant={opt.active ? "destructive" : "outline"}
              onClick={() => toggleActiveMutation.mutate({ id: opt.id, active: opt.active })}
            >
              {opt.active ? "停用" : "重新啟用"}
            </Button>
          </div>
          {expandedOptionId === opt.id && (
            <OptionTriggerEditor
              auth={auth}
              option={opt}
              candidateFields={candidateFields}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["company-config", auth.user.companySlug] })}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="新增選項"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newLabel.trim()) createMutation.mutate(newLabel.trim());
          }}
        />
        <Button size="sm" onClick={() => newLabel.trim() && createMutation.mutate(newLabel.trim())} disabled={!newLabel.trim()}>
          新增
        </Button>
      </div>
    </div>
  );
}

// 自訂欄位管理：讓公司自己在後台開欄位(取代原本寫死在程式碼裡的固定選配欄位)，
// select 型欄位額外展開選項管理。要不要在「費用項目」某個類別底下顯示/要求這個
// 欄位，是另一個獨立的關聯設定(見 CategoryCustomFieldLinks)，這裡只管欄位本身。
export function CustomFieldManager({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "custom-fields", auth.user.companyId];
  const basePath = `/companies/${auth.user.companyId}/custom-fields`;
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CustomFieldItem["fieldType"]>("text");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<CustomFieldItem[]>(basePath, { token: auth.token }),
  });

  // 欄位的新增/改名/停用會影響申請表單要顯示哪些欄位跟顯示的名稱，company-config
  // 那份快取也要一起 invalidate，理由跟 CategoryCustomFieldLinks 的 onSaved 一樣。
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["company-config", auth.user.companySlug] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "操作失敗");

  const createMutation = useMutation({
    mutationFn: (input: { name: string; fieldType: string }) =>
      apiFetch(basePath, { method: "POST", token: auth.token, body: input }),
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

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">自訂欄位(費用明細)</h3>
      <p className="text-xs text-muted-foreground">
        這裡新增的欄位要另外到下面「費用項目關聯欄位」設定，選到哪個費用項目類別時才會顯示/要求填寫。
        拖曳最左邊的把手可以調整順序(申請表單、列印/明細的欄位順序會照這裡的排序顯示)。
        單選選單型的欄位還可以展開「管理選項」，針對每個選項再設定「選到這個選項時要多顯示哪些
        其他自訂欄位」(例如「專案分類」選「ESCO」時只顯示「CAPEX」，選「OTR」時只顯示「OPEX」)。
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {data.length === 0 && <p className="text-sm text-muted-foreground">尚未新增任何自訂欄位</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={data.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {data.map((field) => (
              <SortableItem key={field.id} id={field.id}>
                <div className="flex items-center gap-2">
                  <Input
                    className="max-w-xs"
                    defaultValue={field.name}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== field.name) renameMutation.mutate({ id: field.id, name: value });
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{FIELD_TYPE_LABEL[field.fieldType]}</span>
                  <span className={`text-xs ${field.active ? "text-green-600" : "text-muted-foreground"}`}>
                    {field.active ? "啟用中" : "已停用"}
                  </span>
                  {field.fieldType === "select" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expandedId === field.id ? null : field.id)}
                    >
                      {expandedId === field.id ? "收合選項" : "管理選項"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={field.active ? "destructive" : "outline"}
                    onClick={() => toggleActiveMutation.mutate({ id: field.id, active: field.active })}
                  >
                    {field.active ? "停用" : "重新啟用"}
                  </Button>
                </div>
                {field.fieldType === "select" && expandedId === field.id && (
                  <CustomFieldOptions auth={auth} field={field} allFields={data} />
                )}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex gap-2 border-t pt-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增自訂欄位名稱，例如「成本類型」"
        />
        <select className={SELECT_CLASS + " max-w-[8rem]"} value={newType} onChange={(e) => setNewType(e.target.value as CustomFieldItem["fieldType"])}>
          <option value="text">文字</option>
          <option value="date">日期</option>
          <option value="select">單選選單</option>
        </select>
        <Button
          onClick={() => newName.trim() && createMutation.mutate({ name: newName.trim(), fieldType: newType })}
          disabled={createMutation.isPending || !newName.trim()}
        >
          新增
        </Button>
      </div>
    </div>
  );
}
