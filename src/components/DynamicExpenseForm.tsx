import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import { BrandingProvider } from "@/components/BrandingProvider";
import { ApprovalChain } from "@/components/ApprovalChain";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import { ALL_CURRENCIES } from "@/lib/currencies";
import { PrintableApplicationForm } from "@/components/print/PrintableApplicationForm";

interface ExpenseRowState {
  categoryId: string;
  description: string;
  amount: string;
  currency: string;
  projectCode?: string;
  invoiceDate?: string;
}

function emptyRow(): ExpenseRowState {
  return { categoryId: "", description: "", amount: "", currency: "TWD" };
}

export function DynamicExpenseForm({ auth }: { auth: AuthState }) {
  const queryClient = useQueryClient();
  const { data: config, isLoading, isError } = useCompanyConfig(auth.user.companySlug);
  const [rows, setRows] = useState<ExpenseRowState[]>([emptyRow()]);
  const [departmentId, setDepartmentId] = useState("");
  const [expenseNatureId, setExpenseNatureId] = useState("");
  const [applicationDate, setApplicationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [requestedPaymentDate, setRequestedPaymentDate] = useState("");
  const [submitState, setSubmitState] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string }>({
    status: "idle",
  });

  // 四種狀態都要處理：載入中 / 錯誤 / 空 / 正常
  if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入表單設定中…</div>;
  if (isError || !config) return <div className="p-8 text-center text-destructive">表單設定載入失敗，請重新整理再試一次</div>;

  const { branding, optionalFields, departments, expenseNatures, expenseCategories, approvalStages, multiCurrencyEnabled, exchangeRates } = config;

  const rateByCurrency = new Map<string, number>([["TWD", 1], ...exchangeRates.map((r) => [r.currency, Number(r.rateToTWD)] as const)]);
  const amountInTWD = (row: ExpenseRowState) => {
    const rate = rateByCurrency.get(row.currency);
    return rate === undefined ? null : (Number(row.amount) || 0) * rate;
  };

  const updateRow = (index: number, patch: Partial<ExpenseRowState>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  // 只算「有選費用項目」的列，跟送出/列印時的過濾條件（categoryId 必須有值）保持一致，
  // 不然使用者會看到畫面上的合計金額跟實際送出/列印出來的金額對不起來。
  const validRows = rows.filter((r) => r.categoryId && Number(r.amount) > 0);
  const total = multiCurrencyEnabled
    ? validRows.reduce((sum, row) => sum + (amountInTWD(row) ?? 0), 0)
    : validRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  // 列印版面要顯示的是人看得懂的名稱(部門/費用項目)，不是內部的 id，
  // 所以在這裡把目前表單狀態轉換成 PrintableApplicationForm 需要的形狀。
  const printRows = rows
    .filter((r) => r.categoryId && Number(r.amount) > 0)
    .map((r) => ({
      categoryName: expenseCategories.find((c) => c.id === r.categoryId)?.name ?? "-",
      description: r.description,
      projectCode: r.projectCode,
      invoiceDate: r.invoiceDate,
      currency: r.currency,
      amount: r.amount,
      amountInTWD: amountInTWD(r) === null ? null : Math.round(amountInTWD(r)! * 100) / 100,
    }));
  const departmentName = departments.find((d) => d.id === departmentId)?.name ?? "";
  const expenseNatureName = expenseNatures.find((n) => n.id === expenseNatureId)?.name ?? "";

  const handleSubmit = async () => {
    setSubmitState({ status: "submitting" });
    try {
      await apiFetch(`/companies/${auth.user.companyId}/applications`, {
        method: "POST",
        token: auth.token,
        body: {
          departmentId,
          expenseNatureId,
          applicationDate,
          purpose: purpose || undefined,
          payeeName: optionalFields.payeeInfo ? payeeName || undefined : undefined,
          requestedPaymentDate: optionalFields.requestedPaymentDate ? requestedPaymentDate || undefined : undefined,
          items: rows
            .filter((r) => r.categoryId && Number(r.amount) > 0)
            .map((r) => ({
              categoryId: r.categoryId,
              description: r.description || undefined,
              projectCode: r.projectCode || undefined,
              invoiceDate: r.invoiceDate || undefined,
              currency: r.currency,
              amount: Number(r.amount),
            })),
        },
      });
      setSubmitState({ status: "success", message: "申請單已送出，等待簽核" });
      queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] });
      setRows([emptyRow()]);
      setPurpose("");
      setPayeeName("");
      setRequestedPaymentDate("");
    } catch (err) {
      setSubmitState({ status: "error", message: err instanceof ApiError ? err.message : "送出失敗" });
    }
  };

  return (
    <BrandingProvider branding={branding}>
      {/* 列印/PDF 版面：平常隱藏，只有瀏覽器進入列印模式才會顯示，跟下面的編輯畫面互斥 */}
      <div className="hidden print:block">
        <PrintableApplicationForm
          branding={branding}
          applicantName={auth.user.name}
          departmentName={departmentName}
          applicationDate={applicationDate}
          expenseNatureName={expenseNatureName}
          optionalFields={optionalFields}
          multiCurrencyEnabled={multiCurrencyEnabled}
          rows={printRows}
          purpose={purpose}
          payeeName={payeeName}
          requestedPaymentDate={requestedPaymentDate}
          total={total}
          approvalStages={approvalStages}
        />
      </div>
      <div
        className="min-h-screen p-5 print:hidden"
        style={{ background: `linear-gradient(135deg, ${branding.gradientFrom} 0%, ${branding.gradientTo} 100%)` }}
      >
        <div className="mx-auto max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
          {/* Header：品牌識別完全來自設定，不寫死任何公司名稱 */}
          <div
            className="flex items-center justify-between px-6 py-5 text-white"
            style={{ backgroundColor: branding.headerBgColor }}
          >
            <div>
              <div className="text-xl font-bold">{branding.name}</div>
              {branding.nameEn && <div className="text-sm text-white/70">{branding.nameEn}</div>}
            </div>
            <div className="text-lg">費用申請單</div>
          </div>

          <div className="space-y-6 p-8">
            {/* 基本欄位：部門/費用性質選項完全來自後台設定的資料，不是寫死的 <option> */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <Label>申請人姓名</Label>
                <Input value={auth.user.name} disabled />
              </div>
              <div>
                <Label>部門</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="請選擇" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>申請日期</Label>
                <Input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} />
              </div>
              <div>
                <Label>費用性質</Label>
                <Select value={expenseNatureId} onValueChange={setExpenseNatureId}>
                  <SelectTrigger><SelectValue placeholder="請選擇" /></SelectTrigger>
                  <SelectContent>
                    {expenseNatures.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 費用明細表：欄位隨 optionalFields 開關增減 */}
            <div>
              <h2 className="mb-3 border-b-2 pb-2 text-lg font-bold" style={{ borderColor: branding.primaryColor }}>
                費用明細
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>費用項目</TableHead>
                    {optionalFields.projectCode && <TableHead>專案編號</TableHead>}
                    <TableHead>說明</TableHead>
                    {optionalFields.invoiceDate && <TableHead>發票日期(個人代墊費用可不填)</TableHead>}
                    {multiCurrencyEnabled && <TableHead>幣別</TableHead>}
                    <TableHead>金額 {multiCurrencyEnabled ? "" : "(NTD)"}</TableHead>
                    {multiCurrencyEnabled && <TableHead>換算 TWD</TableHead>}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={row.categoryId} onValueChange={(v) => updateRow(i, { categoryId: v })}>
                          <SelectTrigger><SelectValue placeholder="選擇費用項目" /></SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {optionalFields.projectCode && (
                        <TableCell>
                          <Input value={row.projectCode ?? ""} onChange={(e) => updateRow(i, { projectCode: e.target.value })} placeholder="專案編號" />
                        </TableCell>
                      )}
                      <TableCell>
                        <Input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} placeholder="說明" />
                      </TableCell>
                      {optionalFields.invoiceDate && (
                        <TableCell>
                          <Input type="date" value={row.invoiceDate ?? ""} onChange={(e) => updateRow(i, { invoiceDate: e.target.value })} />
                        </TableCell>
                      )}
                      {multiCurrencyEnabled && (
                        <TableCell>
                          <Select value={row.currency} onValueChange={(v) => updateRow(i, { currency: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ALL_CURRENCIES.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      <TableCell>
                        <Input type="number" value={row.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} placeholder="0" />
                      </TableCell>
                      {multiCurrencyEnabled && (
                        <TableCell className="text-sm text-muted-foreground">
                          {amountInTWD(row) === null ? (
                            <span className="text-destructive">尚未設定匯率</span>
                          ) : (
                            `≈ ${amountInTWD(row)!.toFixed(0)}`
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          刪除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button className="mt-2" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                ＋ 新增一列
              </Button>
            </div>

            {/* 用途說明：後台管理資料以外，兩個既有客戶版本都有的欄位 */}
            <div>
              <Label>費用用途／事由說明</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="請說明用途或支出原因" />
            </div>

            {/* 付款資訊：payeeInfo / requestedPaymentDate 兩個開關各自獨立控制 */}
            {(optionalFields.payeeInfo || optionalFields.requestedPaymentDate) && (
              <div className="grid grid-cols-2 gap-8">
                {optionalFields.payeeInfo && (
                  <div>
                    <Label>受款人(第一次配合請提供銀行存摺)</Label>
                    <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="受款人姓名 / 銀行帳號" />
                  </div>
                )}
                {optionalFields.requestedPaymentDate && (
                  <div>
                    <Label>需求付款日</Label>
                    <Input type="date" value={requestedPaymentDate} onChange={(e) => setRequestedPaymentDate(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div className="text-right text-lg font-bold" style={{ color: branding.primaryColor }}>
              合計金額：{total.toFixed(0)} TWD
            </div>

            {/* 簽核欄：關卡數量與職稱完全來自 approvalStages，不寫死幾關 */}
            <ApprovalChain stages={approvalStages} />

            <div className="flex items-center justify-end gap-3">
              {submitState.status === "success" && <p className="text-sm text-green-600">{submitState.message}</p>}
              {submitState.status === "error" && <p className="text-sm text-destructive">{submitState.message}</p>}
              <Button variant="outline" onClick={() => window.print()}>
                📄 列印 / 匯出 PDF
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  submitState.status === "submitting" ||
                  !departmentId ||
                  !expenseNatureId ||
                  total <= 0 ||
                  (multiCurrencyEnabled && rows.some((r) => r.categoryId && Number(r.amount) > 0 && amountInTWD(r) === null))
                }
              >
                {submitState.status === "submitting" ? "送出中…" : "送出申請"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </BrandingProvider>
  );
}
