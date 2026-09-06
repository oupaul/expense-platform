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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 用來判斷「表單根本還是空的」，空白表單不該自動在後端建立一張草稿——使用者可能只是
// 點進來看一眼就切走，不代表他想要留一筆草稿紀錄。
function isBlankForm(d: {
  departmentId: string;
  expenseNatureId: string;
  payeeName: string;
  requestedPaymentDate: string;
  applicantSignature: string | null;
  rows: ExpenseRowState[];
}): boolean {
  return (
    !d.departmentId &&
    !d.expenseNatureId &&
    !d.payeeName &&
    !d.requestedPaymentDate &&
    !d.applicantSignature &&
    d.rows.length === 1 &&
    !d.rows[0].categoryId &&
    !d.rows[0].description &&
    !d.rows[0].amount
  );
}

interface Props {
  auth: AuthState;
  // 從「我的申請」點進來時可能帶著這個 id，兩種情境共用同一個 prop：
  // 1. 「編輯並重新送出」被退回的申請單(status=returned)，送出時打 resubmit。
  // 2. 「繼續編輯」草稿(status=draft)，送出時打 submit-draft。
  // 實際是哪一種要等 editQuery 抓到資料、看 status 欄位才知道。
  editApplicationId?: string | null;
  onDoneEditing?: () => void;
}

export function DynamicExpenseForm({ auth, editApplicationId, onDoneEditing }: Props) {
  const queryClient = useQueryClient();
  const basePath = `/companies/${auth.user.companyId}/applications`;
  const { data: config, isLoading, isError } = useCompanyConfig(auth.user.companySlug);
  const [rows, setRows] = useState<ExpenseRowState[]>([emptyRow()]);
  const [departmentId, setDepartmentId] = useState("");
  const [expenseNatureId, setExpenseNatureId] = useState("");
  const [applicationDate, setApplicationDate] = useState(todayStr);
  const [payeeName, setPayeeName] = useState("");
  const [requestedPaymentDate, setRequestedPaymentDate] = useState("");
  const [applicantSignature, setApplicantSignature] = useState<string | null>(null);
  // 建立中、還沒有任何申請單 id(從沒進來過編輯模式、也還沒自動存過草稿)時，選好的憑證
  // 檔案先留在這裡；一旦有了 id(不管是自動存草稿拿到的、還是編輯既有申請單/草稿帶進來的)，
  // AttachmentUpload 會直接打 API 上傳，不再需要暫存。
  const [stagedAttachments, setStagedAttachments] = useState<StagedFile[]>([]);
  const [submitState, setSubmitState] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string }>({
    status: "idle",
  });

  // 這次工作階段自動存出來的草稿 id——只有「一開始沒有 editApplicationId、使用者從空白
  // 表單開始填」這種情境才會用到。已經是透過「我的申請」帶 editApplicationId 進來的，
  // 不需要另外存一個，editApplicationId 本身就是那個 id。
  const [sessionDraftId, setSessionDraftId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const draftSaveGeneration = useRef(0);
  // 送出成功後刻意保留部門/費用性質(方便連續送同部門的好幾張申請單)，但這會讓自動存草稿
  // 的判斷誤以為「表單不是空的」，緊接著在使用者什麼都還沒打之前就無中生有建一筆新草稿。
  // 用這個旗標跳過送出成功後的下一次自動存檔，之後使用者真的再動手改欄位才會恢復正常運作。
  const suppressNextAutosave = useRef(false);

  const editQuery = useQuery({
    queryKey: ["application-detail", auth.user.companyId, editApplicationId],
    queryFn: () =>
      apiFetch<ApplicationDetailType>(`${basePath}/${editApplicationId}`, {
        token: auth.token,
      }),
    enabled: !!editApplicationId,
  });

  // 三種狀態互斥：直接建立(從沒進來過編輯模式)、繼續編輯草稿、編輯被退回的申請單重新送出。
  // activeId 是「目前這個表單工作階段對應到後端哪一筆申請單」，isDraftMode 決定存檔/送出
  // 要打草稿那組 API 還是原本建立/resubmit 那組——沒有 editApplicationId 時視同草稿模式，
  // 因為從空白表單開始填、自動存出來的東西本來就是草稿，不會是「退回重新編輯」。
  const loadedStatus = editApplicationId ? editQuery.data?.status : undefined;
  const activeId = editApplicationId ?? sessionDraftId;
  const isDraftMode = editApplicationId ? loadedStatus === "draft" : true;

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
    const isDraft = data.status === "draft";
    setDepartmentId(data.departmentId ?? "");
    setExpenseNatureId(data.expenseNatureId ?? "");
    setApplicationDate(data.applicationDate ? data.applicationDate.slice(0, 10) : todayStr());
    setPayeeName(data.payeeName ?? "");
    setRequestedPaymentDate(data.requestedPaymentDate ? data.requestedPaymentDate.slice(0, 10) : "");
    setRows(
      data.items.length > 0
        ? data.items.map((item) => ({
            categoryId: item.categoryId,
            description: item.description ?? "",
            amount: item.amount,
            currency: item.currency,
            projectCode: item.projectCode ?? undefined,
            invoiceDate: item.invoiceDate ? item.invoiceDate.slice(0, 10) : undefined,
          }))
        : [emptyRow()]
    );
    // 草稿本來簽過的名可以留著繼續用；但退回重新編輯一定要重新簽名，不能沿用舊簽名
    // (這張單內容改過了，舊簽名等於簽在改版前的內容上，沒有意義)。
    setApplicantSignature(isDraft ? data.applicantSignature : null);
    setSubmitState({ status: "idle" });
  }, [editApplicationId, editQuery.data]);

  // 表單內容一有變動就(debounce 過)存到後端當草稿——只有「直接建立」或「繼續編輯草稿」
  // 這兩種情境需要，編輯被退回的申請單不套用這個(那個情境本來就有自己一套用伺服器內容
  // 預填、送出時打 resubmit 的流程，草稿存檔邏輯混進去只會搞亂狀態)。
  useEffect(() => {
    if (editApplicationId && !isDraftMode) return; // 正在編輯被退回的申請單，不自動存草稿
    if (suppressNextAutosave.current) {
      suppressNextAutosave.current = false;
      return;
    }
    if (!activeId && isBlankForm({ departmentId, expenseNatureId, payeeName, requestedPaymentDate, applicantSignature, rows })) {
      return; // 從沒存過草稿、表單也還是空的，不要無中生有建一筆
    }
    const generation = ++draftSaveGeneration.current;
    const timer = setTimeout(async () => {
      const body = {
        departmentId: departmentId || undefined,
        expenseNatureId: expenseNatureId || undefined,
        applicationDate: applicationDate || undefined,
        payeeName: payeeName || undefined,
        requestedPaymentDate: requestedPaymentDate || undefined,
        applicantSignature: applicantSignature || undefined,
        items: rows.map((r) => ({
          categoryId: r.categoryId || undefined,
          description: r.description || undefined,
          projectCode: r.projectCode || undefined,
          invoiceDate: r.invoiceDate || undefined,
          currency: r.currency,
          amount: r.amount ? Number(r.amount) : undefined,
        })),
      };
      try {
        if (activeId) {
          await apiFetch(`${basePath}/${activeId}/draft`, { method: "PUT", token: auth.token, body });
        } else {
          const created = await apiFetch<{ id: string }>(`${basePath}/draft`, {
            method: "POST",
            token: auth.token,
            body,
          });
          // 存的過程中使用者可能已經又改了別的欄位、甚至畫面已經切走再切回來——
          // 只有「還是最新這一次」的存檔結果才要真的套用，不然舊的回應蓋掉新的狀態。
          if (draftSaveGeneration.current === generation) setSessionDraftId(created.id);
        }
        if (draftSaveGeneration.current === generation) setDraftSavedAt(new Date().toISOString());
      } catch {
        // 存草稿失敗(網路問題等)不用跳出來打斷使用者填表單，反正下一次變動又會重試存一次。
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editApplicationId, isDraftMode, activeId, departmentId, expenseNatureId, applicationDate, payeeName, requestedPaymentDate, rows, applicantSignature]);

  // 「取消編輯」只是離開編輯畫面回到空白表單，不會動到伺服器上的草稿/被退回申請單——
  // 真的要刪草稿要按旁邊那顆明確標示「刪除」的按鈕，避免手滑點錯就把東西弄丟。
  const resetToCreateMode = () => {
    setRows([emptyRow()]);
    setDepartmentId("");
    setExpenseNatureId("");
    setApplicationDate(todayStr());
    setPayeeName("");
    setRequestedPaymentDate("");
    setApplicantSignature(null);
    setSessionDraftId(null);
    setDraftSavedAt(null);
    stagedAttachments.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setStagedAttachments([]);
    setSubmitState({ status: "idle" });
    onDoneEditing?.();
  };

  const [deletingDraft, setDeletingDraft] = useState(false);
  const handleDeleteDraft = async () => {
    if (!activeId) {
      resetToCreateMode();
      return;
    }
    setDeletingDraft(true);
    try {
      await apiFetch(`${basePath}/${activeId}/draft`, { method: "DELETE", token: auth.token });
      queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] });
      resetToCreateMode();
    } catch (err) {
      setSubmitState({ status: "error", message: err instanceof ApiError ? err.message : "刪除草稿失敗" });
    } finally {
      setDeletingDraft(false);
    }
  };

  // 四種狀態都要處理：載入中 / 錯誤 / 空 / 正常
  if (isLoading || (editApplicationId && editQuery.isLoading)) {
    return <div className="p-8 text-center text-muted-foreground">載入表單設定中…</div>;
  }
  if (isError || !config || (editApplicationId && editQuery.isError)) {
    return <div className="p-8 text-center text-destructive">表單設定載入失敗，請重新整理再試一次</div>;
  }

  const { branding, optionalFields, departments, expenseNatures, expenseCategories, approvalStages, multiCurrencyEnabled, exchangeRates, printRowsPerPage } = config;

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
    const isResubmit = !!editApplicationId && !isDraftMode;
    const path = isResubmit
      ? `${basePath}/${editApplicationId}/resubmit`
      : activeId
      ? `${basePath}/${activeId}/submit-draft`
      : basePath;
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
      // 正常情況下只要曾經有過 id(草稿自動存檔、或編輯既有申請單/草稿)，附件早就直接
      // 上傳過了，stagedAttachments 會是空的。但草稿是「打字後 debounce 800ms 才存檔」，
      // 使用者可能在第一次自動存檔完成前就選好了附件檔案(那時候 applicationId 還是
      // null，AttachmentUpload 只能先暫存)，所以送出時還是要檢查一次、把可能殘留的
      // 暫存檔案補傳上去，不能只看「一開始有沒有 id」就假設暫存清單一定是空的。
      let attachmentWarning: string | undefined;
      if (stagedAttachments.length > 0) {
        try {
          await apiUpload(`${basePath}/${created.id}/attachments`, stagedAttachments.map((f) => f.file), auth.token);
        } catch {
          attachmentWarning = "申請單已送出，但憑證附件上傳失敗，請到「我的申請」重新上傳。";
        }
        stagedAttachments.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      }
      setSubmitState({
        status: "success",
        message: attachmentWarning ?? (isResubmit ? "已重新送出，等待簽核" : "申請單已送出，等待簽核"),
      });
      queryClient.invalidateQueries({ queryKey: ["applications", auth.user.companyId] });
      if (editApplicationId) {
        queryClient.invalidateQueries({ queryKey: ["application-detail", auth.user.companyId, editApplicationId] });
      }
      suppressNextAutosave.current = true;
      setRows([emptyRow()]);
      setPayeeName("");
      setRequestedPaymentDate("");
      setApplicantSignature(null);
      setStagedAttachments([]);
      setSessionDraftId(null);
      setDraftSavedAt(null);
      if (editApplicationId) onDoneEditing?.();
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
          signatureBoxes={[
            { id: "applicant", label: "申請人", signature: applicantSignature },
            ...approvalStages.map((s) => ({ id: s.id, label: s.label })),
          ]}
          rowsPerPage={printRowsPerPage}
        />
      </div>
      <div className="min-h-screen bg-slate-100 p-5 print:hidden">
        <div className="mx-auto max-w-4xl space-y-4">
          {editApplicationId && !isDraftMode && (
            <div className="flex items-center justify-between rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <span>正在編輯被退回的申請單，修改內容後重新簽名送出，會重新跑一次完整簽核流程。</span>
              <Button size="sm" variant="outline" onClick={resetToCreateMode}>
                取消編輯
              </Button>
            </div>
          )}
          {isDraftMode && activeId && (
            <div className="flex items-center justify-between rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <span>
                {editApplicationId ? "正在繼續編輯草稿。" : "已自動存成草稿。"}
                內容會持續自動暫存，離開後可以在「我的申請」找到並繼續編輯。
              </span>
              <div className="flex gap-2">
                {editApplicationId && (
                  <Button size="sm" variant="outline" onClick={resetToCreateMode}>
                    取消編輯
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={handleDeleteDraft} disabled={deletingDraft}>
                  {deletingDraft ? "刪除中…" : "刪除此草稿"}
                </Button>
              </div>
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
                    {optionalFields.invoiceDate && (
                      <TableHead className="whitespace-nowrap">
                        發票日期
                        <br />
                        <span className="text-xs font-normal">(個人代墊費用可不填)</span>
                      </TableHead>
                    )}
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

            {/* 憑證附件：整張申請單共用一個上傳區，手機可拍照/選相簿，電腦可選檔案。
                有 activeId(草稿或編輯中的申請單)就直接上傳，沒有的話先暫存在瀏覽器記憶體裡。 */}
            <div className="rounded border border-dashed border-slate-300 p-4">
              <AttachmentUpload
                auth={auth}
                applicationId={activeId}
                existingAttachments={activeId ? editQuery.data?.attachments ?? [] : []}
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
              {isDraftMode && draftSavedAt && submitState.status === "idle" && (
                <p className="text-xs text-muted-foreground">
                  已自動存成草稿({new Date(draftSavedAt).toLocaleTimeString("zh-TW")})
                </p>
              )}
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
                {submitState.status === "submitting" ? "送出中…" : editApplicationId && !isDraftMode ? "重新送出申請" : "送出申請"}
              </Button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </BrandingProvider>
  );
}
