import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { FOREIGN_CURRENCIES } from "@/lib/currencies";
import type { AuthState } from "@/types/auth";

interface ExchangeRateItem {
  id: string;
  currency: string;
  rateToTWD: string;
}

export function ExchangeRateManager({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "exchange-rates", auth.user.companyId];
  const basePath = `/companies/${auth.user.companyId}/exchange-rates`;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<ExchangeRateItem[]>(basePath, { token: auth.token }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: ({ currency, rateToTWD }: { currency: string; rateToTWD: number }) =>
      apiFetch(`${basePath}/${currency}`, { method: "PUT", token: auth.token, body: { rateToTWD } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "更新失敗"),
  });

  const deleteMutation = useMutation({
    mutationFn: (currency: string) => apiFetch(`${basePath}/${currency}`, { method: "DELETE", token: auth.token }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "刪除失敗"),
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  const byCurrency = new Map(data.map((r) => [r.currency, r]));

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">匯率設定(1 單位外幣 = 多少 TWD)</h3>
      <p className="text-xs text-muted-foreground">申請單送出時，後端會用這裡的匯率換算成 TWD。沒填的幣別無法在申請單上使用。</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>幣別</TableHead>
            <TableHead>匯率(對 TWD)</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {FOREIGN_CURRENCIES.map((currency) => {
            const existing = byCurrency.get(currency);
            const draftValue = drafts[currency] ?? existing?.rateToTWD ?? "";
            return (
              <TableRow key={currency}>
                <TableCell>{currency}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.0001"
                    value={draftValue}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [currency]: e.target.value }))}
                    placeholder="尚未設定"
                  />
                </TableCell>
                <TableCell className="space-x-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      const value = Number(draftValue);
                      if (value > 0) saveMutation.mutate({ currency, rateToTWD: value });
                    }}
                    disabled={!draftValue || Number(draftValue) <= 0}
                  >
                    儲存
                  </Button>
                  {existing && (
                    <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(currency)}>
                      移除
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
