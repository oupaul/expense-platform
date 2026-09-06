import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { PlatformReportSummary } from "@/types/platform";

export function PlatformReports({ token }: { token: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform", "reports", "summary"],
    queryFn: () => apiFetch<PlatformReportSummary>("/platform/reports/summary", { token }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中…</div>;
  if (isError || !data) return <div className="p-8 text-center text-destructive">載入失敗，請重新整理再試一次</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-xl font-bold">使用狀況報表</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "租戶數", value: data.totalCompanies },
          { label: "使用者數", value: data.totalUsers },
          { label: "申請單總數", value: data.totalApplications },
          { label: "申請單總金額", value: `${data.totalAmountTWD.toLocaleString("zh-TW")} TWD` },
        ].map((stat) => (
          <div key={stat.label} className="rounded border bg-white p-4 text-center">
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <h2 className="mb-3 font-semibold">租戶成長(每月新增)</h2>
          {data.companiesGrowth.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">目前沒有資料</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.companiesGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" name="新增租戶數" stroke="#3498db" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded border bg-white p-4">
          <h2 className="mb-3 font-semibold">申請單量趨勢(每月)</h2>
          {data.applicationsGrowth.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">目前沒有資料</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.applicationsGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" name="申請單數" stroke="#2ecc71" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">各租戶使用狀況</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>租戶</TableHead>
              <TableHead>使用者數</TableHead>
              <TableHead>申請單數</TableHead>
              <TableHead>申請單總金額</TableHead>
              <TableHead>最近活動</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.byCompany.map((c) => (
              <TableRow key={c.companyId}>
                <TableCell>
                  {c.name}
                  <div className="font-mono text-xs text-muted-foreground">{c.slug}</div>
                </TableCell>
                <TableCell>{c.userCount}</TableCell>
                <TableCell>{c.applicationCount}</TableCell>
                <TableCell>{c.totalAmountTWD.toLocaleString("zh-TW")} TWD</TableCell>
                <TableCell>{c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleDateString("zh-TW") : "無"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
