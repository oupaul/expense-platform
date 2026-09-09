import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { OptionItem, CustomFieldItem, CategoryCustomFieldLinkItem } from "@/types/admin";

// 單一費用項目類別展開後的關聯設定——獨立成一個元件才能各自管理自己的
// react-query(每個類別目前關聯了哪些欄位)跟本地編輯狀態，互不影響。
function CategoryLinksEditor({
  auth,
  category,
  fields,
  onSaved,
}: {
  auth: AuthState;
  category: OptionItem;
  fields: CustomFieldItem[];
  onSaved: () => void;
}) {
  const basePath = `/companies/${auth.user.companyId}/expense-categories/${category.id}/custom-fields`;
  const [error, setError] = useState<string | null>(null);
  // { [customFieldId]: required } ——沒出現在這個物件裡代表沒勾選(不關聯)。
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "category-custom-fields", category.id],
    queryFn: () => apiFetch<CategoryCustomFieldLinkItem[]>(basePath, { token: auth.token }),
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

  const activeFields = fields.filter((f) => f.active);
  if (activeFields.length === 0) {
    return <p className="text-xs text-muted-foreground">目前沒有已啟用的自訂欄位可以關聯，先到上面新增。</p>;
  }

  return (
    <div className="space-y-2 rounded border border-dashed p-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {activeFields.map((field) => {
        const checked = field.id in selected;
        return (
          <div key={field.id} className="flex items-center gap-3 text-sm">
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
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
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
        {saveMutation.isPending ? "儲存中…" : "儲存關聯設定"}
      </Button>
    </div>
  );
}

// 費用項目類別 ↔ 自訂欄位的關聯設定：選到某個類別時，費用明細列要多顯示/要求
// 哪些自訂欄位。只有啟用中的類別值得設定(停用的類別本來就不能再被選用)。
export function CategoryCustomFieldLinks({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["admin", "expense-categories", auth.user.companyId],
    queryFn: () => apiFetch<OptionItem[]>(`/companies/${auth.user.companyId}/expense-categories`, { token: auth.token }),
  });
  const fieldsQuery = useQuery({
    queryKey: ["admin", "custom-fields", auth.user.companyId],
    queryFn: () => apiFetch<CustomFieldItem[]>(`/companies/${auth.user.companyId}/custom-fields`, { token: auth.token }),
  });

  if (categoriesQuery.isLoading || fieldsQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  }
  if (categoriesQuery.isError || fieldsQuery.isError || !categoriesQuery.data || !fieldsQuery.data) {
    return <div className="p-4 text-sm text-destructive">載入失敗</div>;
  }

  const activeCategories = categoriesQuery.data.filter((c) => c.active);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">費用項目關聯欄位</h3>
      <p className="text-xs text-muted-foreground">
        選到某個費用項目類別時(例如「專案相關」)，費用明細列要多顯示/要求填寫哪些自訂欄位。
      </p>
      {activeCategories.length === 0 && <p className="text-sm text-muted-foreground">尚未設定任何費用項目類別</p>}
      <div className="space-y-2">
        {activeCategories.map((category) => (
          <div key={category.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{category.name}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExpandedCategoryId(expandedCategoryId === category.id ? null : category.id)}
              >
                {expandedCategoryId === category.id ? "收合" : "設定關聯欄位"}
              </Button>
            </div>
            {expandedCategoryId === category.id && (
              <div className="mt-2">
                <CategoryLinksEditor
                  auth={auth}
                  category={category}
                  fields={fieldsQuery.data}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["admin", "category-custom-fields", category.id] });
                    // 申請單表單讀的是 useCompanyConfig(company-config)那份快取，不invalidate
                    // 的話填表單的人要等 5 分鐘的 staleTime 過期或重新整理頁面才會看到新的關聯。
                    queryClient.invalidateQueries({ queryKey: ["company-config", auth.user.companySlug] });
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
