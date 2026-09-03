import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ApplicationDetail as ApplicationDetailType } from "@/types/application";

const STATUS_LABEL: Record<string, string> = {
  waiting: "等待中",
  approved: "已核准",
  rejected: "已駁回",
};

// 申請單的完整明細 + 簽核進度時間軸，「待簽核清單」跟「我的申請」共用同一份，
// 確保審核者看得到的資訊跟申請人自己查詢時看到的一致。
export function ApplicationDetail({ auth, applicationId }: { auth: AuthState; applicationId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["application-detail", auth.user.companyId, applicationId],
    queryFn: () =>
      apiFetch<ApplicationDetailType>(`/companies/${auth.user.companyId}/applications/${applicationId}`, {
        token: auth.token,
      }),
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入明細中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  return (
    <div className="space-y-4 bg-slate-50 p-4">
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div><span className="text-muted-foreground">申請人：</span>{data.applicant.name}({data.applicant.email})</div>
        <div><span className="text-muted-foreground">部門：</span>{data.department.name}</div>
        <div><span className="text-muted-foreground">費用性質：</span>{data.expenseNature.name}</div>
        <div><span className="text-muted-foreground">申請日期：</span>{new Date(data.applicationDate).toLocaleDateString("zh-TW")}</div>
      </div>

      {data.purpose && <div className="text-sm"><span className="text-muted-foreground">用途說明：</span>{data.purpose}</div>}
      {data.payeeName && <div className="text-sm"><span className="text-muted-foreground">受款人：</span>{data.payeeName}</div>}
      {data.requestedPaymentDate && (
        <div className="text-sm">
          <span className="text-muted-foreground">需求付款日：</span>
          {new Date(data.requestedPaymentDate).toLocaleDateString("zh-TW")}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold">費用明細</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>費用項目</TableHead>
              <TableHead>說明</TableHead>
              <TableHead>幣別</TableHead>
              <TableHead>金額</TableHead>
              <TableHead>換算 TWD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.category.name}</TableCell>
                <TableCell>{item.description ?? "-"}</TableCell>
                <TableCell>{item.currency}</TableCell>
                <TableCell>{item.amount}</TableCell>
                <TableCell>{item.amountInTWD}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-2 text-right text-sm font-semibold">合計：{data.totalAmountTWD} TWD</div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">簽核進度</h4>
        <div className="space-y-1">
          {data.approvalRecords.map((record) => (
            <div key={record.id} className="flex items-center gap-2 text-sm">
              <span
                className={
                  record.status === "approved"
                    ? "text-green-600"
                    : record.status === "rejected"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                ● {record.stage.label}：{STATUS_LABEL[record.status] ?? record.status}
              </span>
              {record.approver && <span className="text-muted-foreground">({record.approver.name})</span>}
              {record.signedAt && (
                <span className="text-muted-foreground">{new Date(record.signedAt).toLocaleString("zh-TW")}</span>
              )}
              {record.comment && <span className="text-muted-foreground">備註：{record.comment}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
