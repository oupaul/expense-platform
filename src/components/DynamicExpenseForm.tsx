import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import { BrandingProvider } from "@/components/BrandingProvider";
import { ApprovalChain } from "@/components/ApprovalChain";
import { SignaturePad } from "@/components/SignaturePad";
import { AttachmentUpload, type StagedFile } from "@/components/AttachmentUpload";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { ApplicationDetail as ApplicationDetailType } from "@/types/application";
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

interface Props {
  auth: AuthState;
  // 從「我的申請」點「編輯並重新送出」被退回的申請單進來時會帶著這個 id，
  // 表單會用該筆申請單的既有內容預填，送出時打 resubmit 而不是建立新的一張。
  editApplicationId?: string | null;
  onDoneEditing?: () => void;
}

export function DynamicExpenseForm({ auth, editApplicationId, onDoneEditing }: Props) {
  const queryClient = useQueryClient();
  const { data: config, isLoading, isError } = useCompanyConfig(auth.user.companySlug);
  const [rows, setRows] = useState<ExpenseRowState[]>([emptyRow()]);
  const [departmentId, setDepartmentId] = useState("");
  const [expenseNatureId, setExpenseNatureId] = useState("");
  const [applicationDate, setApplicationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payeeName, setPayeeName] = useState("");
  const [requestedPaymentDate, setRequestedPaymentDate] = useState("");
  const [applicantSignature, setApplicantSignature] = useState<string | null>(null);
  // 建立中、還沒有申請單 id 時，選好的憑證檔案先留在這裡；等申請單真的建立成功拿到 id，
  // handleSubmit 會立刻把這些暫存檔案補傳上去。編輯已存在的申請單則不會用到這個狀態，
  // 那種情況 AttachmentUpload 會直接打 API 上傳，不需要暫存。
  const [stagedAttachments, setStagedAttachments] = useState<StagedFile[]>([]);
  const [submitState, setSubmitState] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string }>({
    status: "idle",
  });

  const editQuery = useQuery({
    queryKey: ["application-detail", auth.user.companyId, editApplicationId],
    queryFn: () =>
      apiFetch<ApplicationDetailType>(`/companies/${auth.user.companyId}/applications/${editApplicationId}`, {
        token: auth.token,
      }),
    enabled: !!editApplicationId,
  });

  // 資料回來後把既有內容填進表單——用 ref 記住「已經套用過哪個 id」，避免使用者接著手動
  // 修改欄位時，因為 query 快取重新算而把手上正在改的內容蓋掉。
  const appliedEditId = useRef<string | null>(null);
  useEffect(() => {
    if (!editApplicationId) {
      appliedEditId.current = null;
      return;
    }
    if (appliedEditId.current === editApplicationId) return;
    const data = editQuery.data;
    if (!data) return;
    appliedEditId.current = editApplicationId;
    setDepartmentId(data.departmentId);
    setExpenseNatureId(data.expenseNatureId);
    setApplicationDate(data.applicationDate.slice(0, 10));
    setPayeeName(data.payeeName ?? "");
    setRequestedPaymentDate(data.requestedPaymentDate ? data.requestedPaymentDate.slice(0, 10) : "");
    setRows(
      data.items.map((item) => ({
        categoryId: item.categoryId,
        description: item.description ?? "",
        amount: item.amount,
        currency: item.currency,
        projectCode: item.projectCode ?? undefined,
        invoiceDate: item.invoiceDate ? item.invoiceDate.slice(0, 10) : undefined,
      }))
    );
    // 退回後一定要重新簽名，不能沿用舊簽名。
    setApplicantSignature(null);
    setSubmitState({ status: "idle" });
  }, [editApplicationId, editQuery.data]);

  const resetToCreateMode = () => {
    setRows([emptyRow()]);
    setDepartmentId("");
    setExpenseNatureId("");
    setApplicationDate(new Date().toISOString().slice(0, 10));
    setPayeeName("");
    setRequestedPaymentDate("");
    setApplicantSignature(null);
    stagedAttachments.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setStagedAttachments([]);
    setSubmitState({ status: "idle" });
    onDoneEditing?.();
  };

  // 四種狀態都要處理：載入中 / 錯誤 / 空 / 正常
  if (isLoading || (editApplicationId && editQuery.isLoading)) {
    return <div className="p-8 text-center text-muted-foreground">載入表單設定中…</div>;
  }
  if (isError || !config || (editApplicationId && editQuery.isError)) {
    return <div className="p-8 text-center text-destructive">表單設定載入失敗，請重新整理再試一次</div>;
  }

  const { branding, optionalFields, departments, expenseNatures, expenseCategories, approvalStages, multiCurrencyEnabled, exchangeRates } = config;

  const rateByCurrency = new Map<string, number>([["TWD", 1], ...exchangeRates.map((r) => [r.currency, Number(r.rateToTWD)] as const)]);
  const amountInTWD = (row: ExpenseRowState) => {
    const rate = rateByCurrency.get(row.currency);
    return rate === undefined ? null : (Number(row.amount) || 0) * rate;
  };

  const updateRow = (index: number, patch: Partial<ExpenseRowState>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  // 選到「需要專案編號」的類別(例如「專案相關」)時，這一列的專案編號要變必填、最多 10 碼。
  // 這個規則掛在後台可設定的 ExpenseCategory.requiresProjectCode 上，不是寫死某個類別名稱。
  const isProjectCodeRequired = (row: ExpenseRowState) =>
    expenseCategories.find((c) => c.id === row.categoryId)?.requiresProjectCode ?? false;
  const isProjectCodeInvalid = (row: ExpenseRowState) => {
    const code = (row.projectCode ?? "").trim();
    if (isProjectCodeRequired(row)) return code.length === 0 || code.length > 10;
    return code.length > 10;
  };
  // 專案編號欄位本身要不要顯示：公司整體開啟 optionalFields.projectCode，或是任何一個類別
  // 設定了必填，都要顯示——不然選到必填類別時使用者根本看不到欄位可以填。
  const showProjectCodeColumn = optionalFields.projectCode || expenseCategories.some((c) => c.requiresProjectCode);

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
    if (validRows.some(isProjectCodeInvalid)) {
      setSubmitState({ status: "error", message: "有費用明細的專案編號未填寫或超過 10 碼，請檢查標紅的欄位" });
      return;
    }
    if (!applicantSignature) {
      setSubmitState({ status: "error", message: "請先簽名再送出申請單" });
      return;
    }
    setSubmitState({ status: "submitting" });
    const isEditing = !!editApplicationId;
    const path = isEditing
      ? `/companies/${auth.user.companyId}/applications/${editApplicationId}/resubmit`
      : `/companies/${auth.user.companyId}/applications`;
    try {
      const created = await apiFetch<{ id: string }>(path, {
        method: "POST",
        token: auth.token,
        body: {
          departmentId,
          expenseNatureId,
          applicationDate,
          payeeName: optionalFields.payeeInfo ? payeeName || undefined : undefined,
          requestedPaymentDate: optionalFields.requestedPaymentDate ? requestedPaymentDate || undefined : undefined,
          applicantSignature,
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
      // 建立時還沒有申請單 id，暫存的憑證附件要等這裡拿到新 id 才能真的補傳上去；
      // 上傳失敗不擋成功訊息(申請單本身已經送出)，只提醒使用者附件沒傳成功。
      let attachmentWarning: string | undefined;
      if (!isEditing && stagedAttachments.length > 0) {
        try {
          await apiUpload(
            `/companies/${auth.user.companyId}/applications/${created.id}/attachments`,
            stagedAttachments.map((f) => f.file),
            auth.token
          );
        } catch {
          attachmentWarning = "申請單已送出，但憑證附件上傳失敗，請到「我的申請」重新上傳。";
        }
        stagedAttachments.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      }
      setSubmitState({
        status: "success",
        message: attachmentWarning ?? (isEditing ? "已重新送出，等待簽核" : "申請單已送出，等待簽核"),
      });
      queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ["application-detail", auth.user.companyId, editApplicationId] });
      }
      setRows([emptyRow()]);
      setPayeeName("");
      setRequestedPaymentDate("");
      setApplicantSignature(null);
      setStagedAttachments([]);
      if (isEditing) onDoneEditing?.();
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
          optionalFields={{ ...optionalFields, projectCode: showProjectCodeColumn }}
          multiCurrencyEnabled={multiCurrencyEnabled}
          rows={printRows}
          payeeName={payeeName}
          requestedPaymentDate={requestedPaymentDate}
          total={total}
          approvalStages={approvalStages}
          applicantSignature={applicantSignature}
        />
      </div>
      <div className="min-h-screen bg-slate-100 p-5 print:hidden">
        <div className="mx-auto max-w-4xl space-y-4">
          {editApplicationId && (
            <div className="flex items-center justify-between rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <span>正在編輯被退回的申請單，修改內容後重新簽名送出，會重新跑一次完整簽核流程。</span>
              <Button size="sm" variant="outline" onClick={resetToCreateMode}>
                取消編輯
              </Button>
            </div>
          )}
          <div className="overflow-hidden rounded-xl bg-white shadow-md">
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
                    {showProjectCodeColumn && <TableHead>專案編號</TableHead>}
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
                      {showProjectCodeColumn && (
                        <TableCell>
                          <Input
                            value={row.projectCode ?? ""}
                            onChange={(e) => updateRow(i, { projectCode: e.target.value })}
                            placeholder={isProjectCodeRequired(row) ? "專案編號(需10碼)" : "專案編號"}
                            maxLength={10}
                            className={isProjectCodeInvalid(row) ? "border-destructive" : undefined}
                          />
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

            {/* 付款資訊：payeeInfo / requestedPaymentDate 兩個開關各自獨立控制，文字比照參考版型 */}
            {(optionalFields.payeeInfo || optionalFields.requestedPaymentDate) && (
              <div className="grid grid-cols-2 gap-8">
                {optionalFields.payeeInfo && (
                  <div>
                    <Label>受款人(第一次配合請提供銀行存摺)</Label>
                    <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="請輸入受款人資訊" />
                  </div>
                )}
                {optionalFields.requestedPaymentDate && (
                  <div>
                    <Label>需求付款日(如無指定-請填依公司規定)</Label>
                    <Input type="date" value={requestedPaymentDate} onChange={(e) => setRequestedPaymentDate(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div className="text-right text-lg font-bold" style={{ color: branding.primaryColor }}>
              合計金額：{total.toFixed(0)} TWD
            </div>

            {/* 憑證附件：整張申請單共用一個上傳區，手機可拍照/選相簿，電腦可選檔案 */}
            <div className="rounded border border-dashed border-slate-300 p-4">
              <AttachmentUpload
                auth={auth}
                applicationId={editApplicationId ?? null}
                existingAttachments={editApplicationId ? editQuery.data?.attachments ?? [] : []}
                stagedFiles={stagedAttachments}
                onStagedFilesChange={setStagedAttachments}
                onExistingChange={() =>
                  queryClient.invalidateQueries({ queryKey: ["application-detail", auth.user.companyId, editApplicationId] })
                }
              />
            </div>

            {/* 簽核欄：關卡數量與職稱完全來自 approvalStages，不寫死幾關 */}
            <ApprovalChain stages={approvalStages} applicantSignature={applicantSignature} />

            {/* 送出前必須完成簽名：手寫(滑鼠/觸控板/觸控螢幕皆可)或上傳簽名檔 */}
            <div className="rounded border border-dashed border-slate-300 p-4">
              <SignaturePad value={applicantSignature} onChange={setApplicantSignature} label="申請人簽名(送出前必填)" />
            </div>

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
                  (multiCurrencyEnabled && rows.some((r) => r.categoryId && Number(r.amount) > 0 && amountInTWD(r) === null)) ||
                  validRows.some(isProjectCodeInvalid) ||
                  !applicantSignature
                }
              >
                {submitState.status === "submitting" ? "送出中…" : editApplicationId ? "重新送出申請" : "送出申請"}
              </Button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </BrandingProvider>
  );
}
