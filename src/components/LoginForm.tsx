import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import { prewarmMsalInstance } from "@/lib/msal";

interface Props {
  onLogin: (companySlug: string, email: string, password: string) => Promise<unknown>;
  onLoginWithM365: (companySlug: string, tenantId: string, clientId: string) => Promise<unknown>;
}

// 預填示範帳號、底下的提示文字都只在本機開發(`npm run dev`)有意義——那是唯一能保證
// 真的跑過 `npm run seed`、示範資料確實存在的情境。這支元件被同一份建置產物(`vite build`)
// 用在任何部署上，不管是特地灌了示範資料的展示站、還是客戶完全沒選示範資料的正式站，
// 寫死在這裡的話兩種情境都會秀出來，正式站沒有這些帳號會讓人以為是空白畫面壞掉。
const SHOW_DEMO_HINT = import.meta.env.DEV;

export function LoginForm({ onLogin, onLoginWithM365 }: Props) {
  const [companySlug, setCompanySlug] = useState(SHOW_DEMO_HINT ? "demo-a" : "");
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
  const { data: config } = useCompanyConfig(debouncedSlug);
  const heading = config?.branding.name ? `${config.branding.name} 登入` : "費用申請系統登入";

  // 一知道這家公司的 M365 設定就先把 MSAL 建好、initialize 完(見 src/lib/msal.ts 的
  // 說明)，不要等使用者點下按鈕才臨時建立——那樣 initialize() 這個非同步操作會插在
  // 點擊事件跟真正呼叫 loginPopup() 之間，讓瀏覽器把彈出視窗誤判成非使用者主動開啟
  // 而靜默擋掉。
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

  const handleM365Login = async () => {
    if (!config?.m365TenantId || !config.m365ClientId) return;
    setError(null);
    setM365Submitting(true);
    try {
      await onLoginWithM365(companySlug, config.m365TenantId, config.m365ClientId);
    } catch (err) {
      const errorCode = err instanceof Error && "errorCode" in err ? (err as Error & { errorCode: string }).errorCode : undefined;
      if (errorCode === "user_cancelled") {
        // 使用者自己關掉登入彈跳視窗(取消登入)，屬於正常操作，不用顯示錯誤訊息嚇到使用者。
      } else if (errorCode === "popup_window_error") {
        setError("瀏覽器封鎖了登入彈跳視窗，請允許此網站開啟彈跳視窗後再試一次");
      } else {
        setError(err instanceof ApiError ? err.message : "Microsoft 登入失敗，請重新嘗試(詳細錯誤已記錄在瀏覽器主控台)");
      }
    } finally {
      setM365Submitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-lg font-bold">{heading}</h1>
        <div>
          <Label>公司代號</Label>
          <Input value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="例如 acme" />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div>
          <Label>密碼</Label>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
