import { useRef } from "react";
import { usePrintFit } from "@/hooks/usePrintFit";
import type { Branding, OptionalFields, ApprovalStageConfig } from "@/types/company-config";

export interface PrintableRow {
  categoryName: string;
  description: string;
  projectCode?: string;
  invoiceDate?: string;
  currency: string;
  amount: string;
  amountInTWD: number | null;
}

interface Props {
  branding: Branding;
  applicantName: string;
  departmentName: string;
  applicationDate: string;
  expenseNatureName: string;
  optionalFields: OptionalFields;
  multiCurrencyEnabled: boolean;
  rows: PrintableRow[];
  purpose: string;
  payeeName?: string;
  requestedPaymentDate?: string;
  total: number;
  approvalStages: ApprovalStageConfig[];
}

const ROWS_PER_PAGE = 5;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 列印/PDF 輸出版面 —— 沿用參考版型(舊 hzt-expense 系統)的列印原則：
// 超過 5 筆費用明細就分頁，每頁重複公司頁首，只有最後一頁接合計/受款人/簽核欄；
// 5 筆以內則整體縮放塞進一張 A4(見 usePrintFit)。畫面本身平常是隱藏的，只有
// 瀏覽器進入列印模式(.print-block 由 Tailwind 的 `print:` 變體控制)才會顯示。
export function PrintableApplicationForm(props: Props) {
  const {
    branding,
    applicantName,
    departmentName,
    applicationDate,
    expenseNatureName,
    optionalFields,
    multiCurrencyEnabled,
    rows,
    purpose,
    payeeName,
    requestedPaymentDate,
    total,
    approvalStages,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const pages = chunk(rows, ROWS_PER_PAGE);
  const isPaginated = pages.length > 1;
  usePrintFit(containerRef, !isPaginated);

  const signatureBoxes = [{ id: "applicant", label: "申請人" }, ...approvalStages.map((s) => ({ id: s.id, label: s.label }))];

  const renderHeader = () => (
    <div className="flex items-center justify-between px-6 py-4 text-white" style={{ backgroundColor: branding.headerBgColor }}>
      <div>
        <div className="text-lg font-bold">{branding.name}</div>
        {branding.nameEn && <div className="text-xs opacity-80">{branding.nameEn}</div>}
      </div>
      <div className="text-base">費用申請單</div>
    </div>
  );

  const renderTable = (pageRows: PrintableRow[]) => (
    <table className="w-full border-collapse text-[10pt]">
      <thead>
        <tr>
          <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>費用項目</th>
          {optionalFields.projectCode && (
            <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>專案編號</th>
          )}
          <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>說明</th>
          {optionalFields.invoiceDate && (
            <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>發票日期</th>
          )}
          {multiCurrencyEnabled && (
            <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>幣別</th>
          )}
          <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>
            金額{multiCurrencyEnabled ? "" : "(NTD)"}
          </th>
          {multiCurrencyEnabled && (
            <th className="border border-gray-300 p-1.5 text-left text-white" style={{ backgroundColor: branding.headerBgColor }}>換算 TWD</th>
          )}
        </tr>
      </thead>
      <tbody>
        {pageRows.map((row, i) => (
          <tr key={i}>
            <td className="border border-gray-300 p-1.5">{row.categoryName}</td>
            {optionalFields.projectCode && <td className="border border-gray-300 p-1.5">{row.projectCode || "-"}</td>}
            <td className="border border-gray-300 p-1.5">{row.description || "-"}</td>
            {optionalFields.invoiceDate && <td className="border border-gray-300 p-1.5">{row.invoiceDate || "-"}</td>}
            {multiCurrencyEnabled && <td className="border border-gray-300 p-1.5">{row.currency}</td>}
            <td className="border border-gray-300 p-1.5">{row.amount}</td>
            {multiCurrencyEnabled && <td className="border border-gray-300 p-1.5">{row.amountInTWD ?? "-"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderTail = () => (
    <div className="mt-4 space-y-4">
      {purpose && (
        <div className="text-sm"><span className="font-medium">費用用途／事由說明：</span>{purpose}</div>
      )}
      <div className="rounded bg-gray-50 p-3 text-right text-base font-bold" style={{ color: branding.primaryColor }}>
        合計金額：{total.toFixed(0)} TWD
      </div>
      {(optionalFields.payeeInfo || optionalFields.requestedPaymentDate) && (
        <div className="grid grid-cols-2 gap-6 text-sm">
          {optionalFields.payeeInfo && <div><span className="font-medium">受款人：</span>{payeeName || "-"}</div>}
          {optionalFields.requestedPaymentDate && (
            <div><span className="font-medium">需求付款日：</span>{requestedPaymentDate || "-"}</div>
          )}
        </div>
      )}
      <div>
        <h3 className="mb-2 border-b-2 pb-1 text-base font-bold" style={{ borderColor: branding.primaryColor }}>簽核欄</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${signatureBoxes.length}, minmax(0, 1fr))` }}>
          {signatureBoxes.map((box) => (
            <div key={box.id} className="rounded border border-gray-300 p-3 text-center">
              <div className="mb-6 text-sm font-medium">{box.label}</div>
              <div className="border-t border-dashed border-gray-400 pt-1 text-xs text-gray-400">簽名處</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="bg-white text-black">
      {pages.map((pageRows, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === pages.length - 1;
        return (
          <div key={idx} className={isFirst ? undefined : "break-before-page"}>
            {renderHeader()}
            <div className="p-4">
              {isFirst && (
                <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium">申請人姓名：</span>{applicantName}</div>
                  <div><span className="font-medium">部門：</span>{departmentName || "-"}</div>
                  <div><span className="font-medium">申請日期：</span>{applicationDate}</div>
                  <div><span className="font-medium">費用性質：</span>{expenseNatureName || "-"}</div>
                </div>
              )}
              {renderTable(pageRows)}
              {isLast && renderTail()}
              {isPaginated && (
                <div className="mt-3 border-t border-dashed border-gray-300 pt-1.5 text-right text-[9pt] text-gray-500">
                  第 {idx + 1} 頁 / 共 {pages.length} 頁{!isLast && "　接續下一頁 →"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
