import { useRef } from "react";
import { usePrintFit } from "@/hooks/usePrintFit";
import type { Branding, OptionalFields } from "@/types/company-config";

export interface PrintableRow {
  categoryName: string;
  description: string;
  projectCode?: string;
  invoiceDate?: string;
  currency: string;
  amount: string;
  amountInTWD: number | null;
}

export interface PrintableSignatureBox {
  id: string;
  label: string;
  signature?: string | null;
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
  payeeName?: string;
  requestedPaymentDate?: string;
  total: number;
  // 呼叫端自己組好每一格簽核欄要顯示誰、簽了沒有——填寫中的申請單只有申請人簽了，
  // 其他關卡都是空的；已經簽核完成的申請單則每一關都要秀出實際簽名，
  // 兩種情境的資料來源完全不同(前者是即時表單狀態，後者是已存檔的簽核紀錄)，
  // 讓元件收現成的陣列比自己內部判斷簡單、也不用另外分辨兩種情境。
  signatureBoxes: PrintableSignatureBox[];
  // 每頁最多幾筆費用明細，超過就分頁——來自 Company.printRowsPerPage(後台「公司設定」
  // 可調)，不是這個元件自己寫死的數字，因為多少筆合理跟每家公司「說明」欄位習慣填多長
  // 高度相關(見下面 DEFAULT_ROWS_PER_PAGE 的實測筆記)，不同客戶可能想要不同的值。
  rowsPerPage: number;
}

// 沒有從呼叫端拿到 rowsPerPage 時的保底值(理論上不會發生，兩個呼叫端都固定會帶公司設定
// 過來)。這個數字是實測過的(本機量測，含合計/受款人/需求付款日/簽核欄)：說明欄位是一般
// 短文字、不換行時，一頁 A4 實際可以放到 16 筆左右才會超出可印刷高度(297mm 扣掉上下 15mm
// 邊界)；但「說明」欄位長度是使用者自由輸入，一旦長到在儲存格裡換成兩行，每筆的高度會從
// 約 33px 跳到約 53px，16 筆的極限一下就會被吃光。12 筆時短文字只用掉約 875/1009px 的
// 版面，留了足夠的緩衝空間給換行的說明文字，真的超出的極端情況再交給 usePrintFit 整頁
// 縮放兜底。
const DEFAULT_ROWS_PER_PAGE = 12;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 列印/PDF 輸出版面 —— 沿用參考版型(舊 hzt-expense 系統)的列印原則：
// 超過 rowsPerPage 筆費用明細就分頁，每頁重複公司頁首，只有最後一頁接合計/受款人/
// 簽核欄；筆數在門檻以內則整體縮放塞進一張 A4(見 usePrintFit)。畫面本身平常是隱藏的，
// 只有瀏覽器進入列印模式(.print-block 由 Tailwind 的 `print:` 變體控制)才會顯示。
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
    payeeName,
    requestedPaymentDate,
    total,
    signatureBoxes,
    rowsPerPage,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const pages = chunk(rows, rowsPerPage || DEFAULT_ROWS_PER_PAGE);
  const isPaginated = pages.length > 1;
  usePrintFit(containerRef, !isPaginated);

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
              <div className="mb-1 text-sm font-medium">{box.label}</div>
              {box.signature ? (
                <img src={box.signature} alt={`${box.label}簽名`} className="mx-auto h-10 object-contain" />
              ) : (
                <div className="h-10" />
              )}
              <div className="border-t border-dashed border-gray-400 pt-1 text-xs text-gray-400">
                {box.signature ? "" : "簽名處"}
              </div>
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
          // minHeight 267mm = A4 扣掉 @page 上下各 15mm 邊界(跟 usePrintFit 換算單頁高度
          // 用的數字一致)，搭配 flex column 讓底下的合計/受款人/簽核欄用 mt-auto 貼齊
          // 頁面最下方——不管這頁表格印了幾筆，簽名欄的位置都固定在同一個高度，
          // 比讓它緊跟在表格後面(筆數少時會卡在頁面中段)更接近紙本表單的排版習慣。
          <div
            key={idx}
            className={`flex flex-col ${isFirst ? "" : "break-before-page"}`}
            style={{ minHeight: "267mm" }}
          >
            {renderHeader()}
            <div className="flex flex-1 flex-col p-4">
              {isFirst && (
                <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium">申請人姓名：</span>{applicantName}</div>
                  <div><span className="font-medium">部門：</span>{departmentName || "-"}</div>
                  <div><span className="font-medium">申請日期：</span>{applicationDate}</div>
                  <div><span className="font-medium">費用性質：</span>{expenseNatureName || "-"}</div>
                </div>
              )}
              {renderTable(pageRows)}
              <div className="mt-auto">
                {isLast && renderTail()}
                {isPaginated && (
                  <div className="mt-3 border-t border-dashed border-gray-300 pt-1.5 text-right text-[9pt] text-gray-500">
                    第 {idx + 1} 頁 / 共 {pages.length} 頁{!isLast && "　接續下一頁 →"}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
