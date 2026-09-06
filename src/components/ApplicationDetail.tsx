import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AttachmentList } from "@/components/AttachmentList";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import { PrintableApplicationForm } from "@/components/print/PrintableApplicationForm";
import type { AuthState } from "@/types/auth";
import type { ApplicationDetail as ApplicationDetailType } from "@/types/application";

const STATUS_LABEL: Record<string, string> = {
  waiting: "等待中",
  approved: "已核准",
  rejected: "已駁回",
  returned: "已退回",
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
  // 只是要拿公司品牌設定(顏色、名稱)給列印版面用；這個 query 在別的地方(填寫申請單)
  // 已經打過、有 5 分鐘快取，這裡再叫一次不會多一次真正的網路請求。
  const { data: config } = useCompanyConfig(auth.user.companySlug);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">載入明細中…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-destructive">載入失敗</div>;

  // 已經送出/簽核完成的申請單，列印要呈現的是「這張單實際記錄的內容」，不是公司目前的
  // optionalFields/多幣別開關——那些設定之後可能會被後台改掉，但這張單當初填了什麼、
  // 用了什麼幣別，應該照實呈現，不該因為公司設定變了而在舊單子的列印結果上消失或變動。
  const printOptionalFields = {
    projectCode: data.items.some((i) => i.projectCode),
    invoiceDate: data.items.some((i) => i.invoiceDate),
    payeeInfo: !!data.payeeName,
    requestedPaymentDate: !!data.requestedPaymentDate,
  };
  const printMultiCurrencyEnabled = data.items.some((i) => i.currency !== "TWD");
  const printRows = data.items.map((item) => ({
    categoryName: item.category.name,
    description: item.description ?? "",
    projectCode: item.projectCode ?? undefined,
    invoiceDate: item.invoiceDate ?? undefined,
    currency: item.currency,
    amount: item.amount,
    amountInTWD: Number(item.amountInTWD),
  }));
  const signatureBoxes = [
    { id: "applicant", label: "申請人", signature: data.applicantSignature },
    ...data.approvalRecords.map((r) => ({ id: r.id, label: r.stage.label, signature: r.signatureImage })),
  ];

  return (
    <div className="space-y-4 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid grow grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div><span className="text-muted-foreground">申請人：</span>{data.applicant.name}({data.applicant.email})</div>
          <div><span className="text-muted-foreground">部門：</span>{data.department.name}</div>
          <div><span className="text-muted-foreground">費用性質：</span>{data.expenseNature.name}</div>
          <div><span className="text-muted-foreground">申請日期：</span>{new Date(data.applicationDate).toLocaleDateString("zh-TW")}</div>
        </div>
        <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
          📄 列印 / 匯出 PDF
        </Button>
      </div>

      {data.status === "returned" && data.returnComment && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-semibold text-amber-800">
            已被「{data.returnedByStageLabel}」退回，請修改後重新送出
          </div>
          <div className="mt-1 text-amber-700">備註說明：{data.returnComment}</div>
          {data.returnedAt && (
            <div className="mt-1 text-xs text-amber-600">{new Date(data.returnedAt).toLocaleString("zh-TW")}</div>
          )}
        </div>
      )}

      {data.applicantSignature && (
        <div className="text-sm">
          <span className="mb-1 block text-muted-foreground">申請人簽名：</span>
          <img src={data.applicantSignature} alt="申請人簽名" className="h-12 rounded border bg-white object-contain p-1" />
        </div>
      )}

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

      {data.attachments.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">憑證附件</h4>
          <AttachmentList auth={auth} applicationId={data.id} attachments={data.attachments} />
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold">簽核進度</h4>
        <div className="space-y-1">
          {data.approvalRecords.map((record) => (
            <div key={record.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={
                  record.status === "approved"
                    ? "text-green-600"
                    : record.status === "rejected"
                    ? "text-destructive"
                    : record.status === "returned"
                    ? "text-amber-600"
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
              {record.signatureImage && (
                <img src={record.signatureImage} alt={`${record.stage.label}簽名`} className="h-8 rounded border bg-white object-contain p-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 列印版面用 portal 直接掛到 document.body，脫離目前所在的表格/清單 DOM 結構——
          這個元件常常是巢狀在「我的申請」「待簽核清單」的表格列展開內容裡，如果列印區塊
          留在原本的位置，父層只要有任何一層被標成 print:hidden，這個區塊也會被一起隱藏
          (子層再怎麼設 print:block 都救不回被 display:none 的祖先)，印出來就會是空白。
          掛到 body 之後完全不受原本頁面結構影響，一定看得到。 */}
      {config &&
        createPortal(
          <div className="hidden print:block">
            <PrintableApplicationForm
              branding={config.branding}
              applicantName={data.applicant.name}
              departmentName={data.department.name}
              applicationDate={new Date(data.applicationDate).toLocaleDateString("zh-TW")}
              expenseNatureName={data.expenseNature.name}
              optionalFields={printOptionalFields}
              multiCurrencyEnabled={printMultiCurrencyEnabled}
              rows={printRows}
              payeeName={data.payeeName ?? undefined}
              requestedPaymentDate={
                data.requestedPaymentDate ? new Date(data.requestedPaymentDate).toLocaleDateString("zh-TW") : undefined
              }
              total={Number(data.totalAmountTWD)}
              signatureBoxes={signatureBoxes}
              rowsPerPage={config.printRowsPerPage}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
