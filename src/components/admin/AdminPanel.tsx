import { OptionManager } from "@/components/admin/OptionManager";
import { ApprovalStageManager } from "@/components/admin/ApprovalStageManager";
import { CompanySettingsManager } from "@/components/admin/CompanySettingsManager";
import { ExchangeRateManager } from "@/components/admin/ExchangeRateManager";
import { UserManager } from "@/components/admin/UserManager";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import type { AuthState } from "@/types/auth";

export function AdminPanel({ auth }: { auth: AuthState }) {
  const { data: config, isLoading, isError } = useCompanyConfig(auth.user.companySlug);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-xl font-bold">後台管理 — {auth.user.companySlug}</h1>

      <div className="rounded-lg border bg-white p-6">
        {isLoading && <div className="text-sm text-muted-foreground">載入中…</div>}
        {isError || !config ? (
          <div className="text-sm text-destructive">載入失敗</div>
        ) : (
          <CompanySettingsManager auth={auth} config={config} />
        )}
      </div>
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
        <ApprovalStageManager auth={auth} />
      </div>
      <div className="rounded-lg border bg-white p-6">
        <ExchangeRateManager auth={auth} />
      </div>
      <div className="rounded-lg border bg-white p-6">
        <UserManager auth={auth} />
      </div>
    </div>
  );
}
