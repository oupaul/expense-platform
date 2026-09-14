import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiFetch, apiFetchBlobUrl, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ReportSummary } from "@/types/admin";

const STATUS_LABEL: Record<string, string> = {
  pending: "審核中",
  approved: "已核准",
  rejected: "已駁回",
  returned: "已退回",
};

const CHART_COLORS = ["#3498db", "#2ecc71", "#f39c12", "#e74c3c", "#9b59b6", "#1abc9c", "#34495e", "#e67e22"];

function formatTWD(value: number): string {
  return `${value.toLocaleString("zh-TW")} TWD`;
}

// recharts 在這個專案的建置環境下實測有兩個獨立的渲染缺陷：
// 1. <Bar>/<BarChart>：無論資料內容，<g class="recharts-bar-rectangle"> 底下永遠是空的，
//    完全畫不出長條形狀(v2、v3 都一樣)。
// 2. <Pie>：只有「單一分類佔 100%」時(只有一個費用類別有支出，很常見的實際情境)，扇形的
//    起訖角度算出來幾乎相同，畫出來是一條看不見的細縫而不是一個完整的圓——實測 DOM 上的
//    <path> 只有 2.86px 高，不是預期的完整圓形。
// 兩個都是拿真實資料測出來、不是猜測。與其繼續在第三方套件裡追這些邊界案例，這種「比較幾個
// 類別大小」的呈現改用純 CSS 寬度做水平長條圖更單純、更不會壞；只有 <Line>(趨勢圖)已確認
// 在各種資料下都正常，維持使用 recharts。
function HorizontalBarList({
  items,
  colorClass = "bg-blue-500",
  formatValue = (v: number) => v.toLocaleString("zh-TW"),
}: {
  items: { label: string; value: number }[];
  colorClass?: string;
  formatValue?: (value: number) => string;
}) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span>{item.label}</span>
            <span className="text-muted-foreground">{formatValue(item.value)}</span>
          </div>
          <div className="h-3 w-full rounded bg-slate-100">
            <div
              className={`h-3 rounded ${colorClass}`}
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// from/to 兩個篩選欄位在畫面上留空時，代表「用後端預設的近 12 個月」——/summary
// 跟 /export 這兩支 API 都要照同一個篩選條件查，共用同一個組 query string 的邏輯，
// 不然以後改了篩選欄位的行為，兩處各自維護容易漏改到其中一邊。
function buildDateRangeQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function ReportsView({ auth }: { auth: AuthState }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports", "summary", auth.user.companyId, from, to],
    queryFn: () =>
      apiFetch<ReportSummary>(`/companies/${auth.user.companyId}/reports/summary${buildDateRangeQuery(from, to)}`, {
        token: auth.token,
      }),
  });

  // 匯出的 Excel 檔案名稱要跟畫面上實際顯示的區間一致——from/to 留空時後端會套用
  // 「近 12 個月」的預設值，這個實際解析出來的日期只有 /summary 的回應(data.range)
  // 裡才查得到，不能只看使用者自己填的(可能是空的)from/to 這兩個欄位。
  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const url = await apiFetchBlobUrl(
        `/companies/${auth.user.companyId}/reports/export${buildDateRangeQuery(from, to)}`,
        auth.token
      );
      const rangeFrom = data?.range.from.slice(0, 10) ?? from;
      const rangeTo = data?.range.to.slice(0, 10) ?? to;
      const a = document.createElement("a");
      a.href = url;
      a.download = `expense-report-${rangeFrom}_${rangeTo}.xlsx`;
      a.click();
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "匯出失敗，請稍後再試一次");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-xl font-bold">報表</h1>

      <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <div>
          <Label>起</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>迄</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? "匯出中…" : "匯出 Excel"}
        </Button>
        <p className="text-xs text-muted-foreground">
          留空預設顯示近 12 個月。「支出」統計只計入已核准的申請單，匯出的 Excel 逐筆明細也是同一個範圍。
        </p>
        {exportError && <p className="w-full text-sm text-destructive">{exportError}</p>}
      </div>

      {isLoading && <div className="p-8 text-center text-muted-foreground">載入中…</div>}
      {isError && <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>}

      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded border bg-white p-4">
            <h2 className="mb-3 font-semibold">各部門支出(已核准)</h2>
            {data.byDepartment.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">此區間沒有已核准的申請單</p>
            ) : (
              <HorizontalBarList
                items={data.byDepartment.map((d) => ({ label: d.name, value: d.totalTWD }))}
                formatValue={formatTWD}
              />
            )}
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="mb-3 font-semibold">各費用類別支出(已核准)</h2>
            {data.byCategory.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">此區間沒有已核准的申請單</p>
            ) : (
              <HorizontalBarList
                items={data.byCategory.map((c) => ({ label: c.name, value: c.totalTWD }))}
                colorClass="bg-amber-500"
                formatValue={formatTWD}
              />
            )}
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="mb-3 font-semibold">簽核狀態分佈(全部狀態)</h2>
            {data.byStatus.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">此區間沒有申請單</p>
            ) : (
              <HorizontalBarList
                items={data.byStatus.map((s) => ({ label: `${STATUS_LABEL[s.status] ?? s.status}(${s.count} 件)`, value: s.count }))}
                colorClass="bg-emerald-500"
              />
            )}
          </div>

          <div className="rounded border bg-white p-4">
            <h2 className="mb-3 font-semibold">月度支出趨勢(已核准)</h2>
            {data.monthlyTrend.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">此區間沒有已核准的申請單</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatTWD(value)} />
                  <Line type="monotone" dataKey="totalTWD" stroke={CHART_COLORS[2]} strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
