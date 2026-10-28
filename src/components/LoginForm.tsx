import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import { prewarmMsalInstance } from "@/lib/msal";
import { clearLinkedCompanyFromUrl, getLinkedCompany, getRememberedCompany } from "@/lib/loginCompany";

interface Props {
  onLogin: (companySlug: string, email: string, password: string) => Promise<unknown>;
  onLoginWithM365: (companySlug: string, tenantId: string, clientId: string) => Promise<unknown>;
  // 應用程式剛啟動、正在檢查「這次是不是從 Microsoft 登入導回來的」——這段期間要先擋掉
  // 正常的登入表單，不然使用者會誤以為畫面卡住或登入失敗(見 useAuth.ts 的說明)。
  m365Processing: boolean;
  m365Error: string | null;
  // 登入頁頂端的提示，例如「登入已過期，請重新登入」。
  notice?: string | null;
}

// 預填示範帳號、底下的提示文字都只在本機開發(`npm run dev`)有意義——那是唯一能保證
// 真的跑過 `npm run seed`、示範資料確實存在的情境。這支元件被同一份建置產物(`vite build`)
// 用在任何部署上，不管是特地灌了示範資料的展示站、還是客戶完全沒選示範資料的正式站，
// 寫死在這裡的話兩種情境都會秀出來，正式站沒有這些帳號會讓人以為是空白畫面壞掉。
const SHOW_DEMO_HINT = import.meta.env.DEV;

export function LoginForm({ onLogin, onLoginWithM365, m365Processing, m365Error, notice }: Props) {
  // 公司代號的來源，由優先到保底：專屬登入連結(?c=acme，會鎖定、隱藏輸入框)、瀏覽器記住的上次
  // 登入的公司、本機開發的示範預填。連結帶進來的才鎖定，記住的只是預填，使用者隨時可以改。
  const [lockedSlug, setLockedSlug] = useState<string | null>(getLinkedCompany);
  const [companySlug, setCompanySlug] = useState(() => getLinkedCompany() ?? getRememberedCompany() ?? (SHOW_DEMO_HINT ? "demo-a" : ""));
  const [email, setEmail] = useState(SHOW_DEMO_HINT ? "applicant@demo-a.test" : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [m365Submitting, setM365Submitting] = useState(false);

  // 登入頁的標題要跟著使用者正在打的公司代號走(客戶要求：每家租戶登入頁看到的名稱要是
  // 自己公司的名字，不是寫死的通用系統名稱)。用打字時 debounce 一下再查，不要每打一個字
  // 就送一次請求；公司代號打錯字/查無此公司就靜靜地掉回通用標題，不用跳錯誤訊息干擾輸入。
  const [debouncedSlug, setDebouncedSlug] = useState(companySlug);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSlug(companySlug.trim()), 400);
    return () => clearTimeout(timer);
  }, [companySlug]);
  const { data: config, isError: configError } = useCompanyConfig(debouncedSlug);
  const heading = config?.branding.name ? `${config.branding.name} 登入` : "費用申請系統登入";

  // 一知道這家公司的 M365 設定就先把 MSAL 建好、initialize 完，不用等使用者點下按鈕
  // 才臨時建立、多等一次 initialize() 的非同步時間(見 src/lib/msal.ts 的說明)。
  useEffect(() => {
    if (config?.m365Enabled && config.m365TenantId && config.m365ClientId) {
      prewarmMsalInstance(config.m365TenantId, config.m365ClientId);
    }
  }, [config?.m365Enabled, config?.m365TenantId, config?.m365ClientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(companySlug, email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登入失敗");
    } finally {
      setSubmitting(false);
    }
  };

  // 點下去之後 onLoginWithM365 內部會呼叫 loginRedirect()，整個分頁會直接導去
  // Microsoft，這個 function 剩下的部分(包括這裡的 catch/finally)理論上不會真的
  // 執行到——只有在導轉「還沒發生」就出錯的情況(例如 MSAL 設定本身有問題)才會走到這裡。
  const handleM365Login = async () => {
    if (!config?.m365TenantId || !config.m365ClientId) return;
    setError(null);
    setM365Submitting(true);
    try {
      await onLoginWithM365(companySlug, config.m365TenantId, config.m365ClientId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Microsoft 登入失敗，請重新嘗試(詳細錯誤已記錄在瀏覽器主控台)");
    } finally {
      setM365Submitting(false);
    }
  };

  // 應用程式剛啟動、正在檢查是不是從 Microsoft 登入導回來——這段期間先不要渲染正常的
  // 登入表單(尤其不要讓使用者以為卡住而亂點什麼)，登入完成後 auth 會有值，App.tsx
  // 會自動切到已登入的畫面，這個過渡畫面自然就消失了。
  if (m365Processing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-muted-foreground">Microsoft 登入處理中…</p>
      </div>
    );
  }

  const displayError = error ?? m365Error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-lg font-bold">{heading}</h1>
        <div>
          {lockedSlug ? (
            <>
              <Label>公司</Label>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate">{config?.branding.name ?? lockedSlug}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground underline"
                  onClick={() => {
                    setLockedSlug(null);
                    clearLinkedCompanyFromUrl();
                  }}
                >
                  改用其他公司
                </button>
              </div>
              {configError && (
                <p className="mt-1 text-xs text-destructive">
                  找不到這個公司代號，請確認連結是否正確，或按「改用其他公司」手動輸入。
                </p>
              )}
            </>
          ) : (
            <>
              <Label>公司代號</Label>
              <Input value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="例如 acme" />
            </>
          )}
        </div>
        <div>
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div>
          <Label>密碼</Label>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </div>
        {notice && !displayError && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
        {displayError && <p className="text-sm text-destructive">{displayError}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "登入中…" : "登入"}
        </Button>
        {config?.m365Enabled && config.m365TenantId && config.m365ClientId && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              或
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleM365Login}
              disabled={m365Submitting}
            >
              {m365Submitting ? "登入中…" : "使用 Microsoft 帳號登入"}
            </Button>
          </>
        )}
        {SHOW_DEMO_HINT && (
          <p className="text-xs text-muted-foreground">
            示範帳號：admin / applicant / dept_manager / finance / ceo(或 gm)@demo-a.test 或 @demo-b.test，
            密碼是執行 `npm run seed` 當下 console 印出來的那組隨機密碼(每次跑都不一樣)。
          </p>
        )}
      </form>
    </div>
  );
}
