import { useState } from "react";
import { OptionManager } from "@/components/admin/OptionManager";
import { ApprovalStageManager } from "@/components/admin/ApprovalStageManager";
import { CompanySettingsManager } from "@/components/admin/CompanySettingsManager";
import { ExchangeRateManager } from "@/components/admin/ExchangeRateManager";
import { UserManager } from "@/components/admin/UserManager";
import { CustomFieldManager } from "@/components/admin/CustomFieldManager";
import { CategoryCustomFieldLinks } from "@/components/admin/CategoryCustomFieldLinks";
import { CompanyNotificationSettings } from "@/components/admin/CompanyNotificationSettings";
import { NotificationLog } from "@/components/admin/NotificationLog";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import type { AuthState } from "@/types/auth";

type Tab = "general" | "form-options" | "workflow" | "notifications";

const TABS: { value: Tab; label: string }[] = [
  { value: "general", label: "基本設定" },
  { value: "form-options", label: "表單選項" },
  { value: "workflow", label: "簽核與使用者" },
  { value: "notifications", label: "通知" },
];

// 分頁分組原則：不是每個區塊各佔一個分頁(那樣分頁數太多、跟直接往下捲沒兩樣)，
// 而是依「管理者要做什麼」歸類——調整申請單上會出現的選項欄放一起(表單選項)，
// 簽核流程本來就跟「誰能簽核」(使用者角色)高度相關放一起，通知的寄信設定跟
// 寄送記錄放一起方便對照。隨著功能持續增加，新區塊優先看屬於哪一類，數量真的
// 太多了才考慮拆出新分頁。
export function AdminPanel({ auth }: { auth: AuthState }) {
  const { data: config, isLoading, isError } = useCompanyConfig(auth.user.companySlug);
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-xl font-bold">後台管理 — {auth.user.companySlug}</h1>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.value ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6">
            {isLoading && <div className="text-sm text-muted-foreground">載入中…</div>}
            {isError || !config ? (
              <div className="text-sm text-destructive">載入失敗</div>
            ) : (
              <CompanySettingsManager auth={auth} config={config} />
            )}
          </div>
          <div className="rounded-lg border bg-white p-6">
            <ExchangeRateManager auth={auth} />
          </div>
        </div>
      )}

      {tab === "form-options" && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6">
            <OptionManager auth={auth} resourcePath="departments" title="部門" />
          </div>
          <div className="rounded-lg border bg-white p-6">
            <OptionManager auth={auth} resourcePath="expense-categories" title="費用項目" showRequiresProjectCode />
          </div>
          <div className="rounded-lg border bg-white p-6">
            <OptionManager auth={auth} resourcePath="expense-natures" title="費用性質" />
          </div>
          <div className="rounded-lg border bg-white p-6">
            <CustomFieldManager auth={auth} />
          </div>
          <div className="rounded-lg border bg-white p-6">
            <CategoryCustomFieldLinks auth={auth} />
          </div>
        </div>
      )}

      {tab === "workflow" && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6">
            <ApprovalStageManager auth={auth} />
          </div>
          <div className="rounded-lg border bg-white p-6">
            <UserManager auth={auth} />
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6">
            <CompanyNotificationSettings auth={auth} />
          </div>
          <div className="rounded-lg border bg-white p-6">
            <NotificationLog auth={auth} />
          </div>
        </div>
      )}
    </div>
  );
}
