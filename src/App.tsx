import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DynamicExpenseForm } from "@/components/DynamicExpenseForm";
import { PendingApprovals } from "@/components/PendingApprovals";
import { MyApplications } from "@/components/MyApplications";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { PlatformApp } from "@/components/platform/PlatformApp";
import { BrandingProvider } from "@/components/BrandingProvider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import type { AuthState } from "@/types/auth";

const queryClient = new QueryClient();

type Tab = "form" | "my-applications" | "approvals" | "admin" | "password";

function AuthenticatedApp({ auth, logout }: { auth: AuthState; logout: () => void }) {
  const [tab, setTab] = useState<Tab>("form");
  // 從「我的申請」點「編輯並重新送出」被退回的申請單時，帶著 id 切到填寫申請單分頁，
  // 讓 DynamicExpenseForm 用既有內容預填、走 resubmit 而不是建立新的一張。
  const [editApplicationId, setEditApplicationId] = useState<string | null>(null);
  const isAdmin = auth.user.role === "admin";
  // 品牌設定(分頁標題/圖示/顏色)要套用在整個已登入畫面，不能只放在某一個分頁裡面——
  // 不然使用者切到「後台管理」改了公司名稱/圖示，要跳回「填寫申請單」才會看到套用。
  const { data: config } = useCompanyConfig(auth.user.companySlug);

  const tabButton = (value: Tab, label: string) => (
    <button
      onClick={() => setTab(value)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        tab === value ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  const content = (
    <div>
      {/* sticky 而非 fixed：佔用實際版面高度、把下面內容往下推，
          不會疊在公司名稱上面(手機窄螢幕尤其明顯)。flex-wrap 讓按鈕在窄螢幕自動換行。 */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b bg-white/95 px-4 py-2 shadow-sm print:hidden">
        <button
          onClick={() => {
            setEditApplicationId(null);
            setTab("form");
          }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "form" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          填寫申請單
        </button>
        {tabButton("my-applications", "我的申請")}
        {tabButton("approvals", "待簽核")}
        {isAdmin && tabButton("admin", "後台管理")}
        {tabButton("password", "修改密碼")}
        <span className="px-2 text-xs text-slate-400">{auth.user.name}({auth.user.role})</span>
        <Button variant="ghost" size="sm" onClick={logout}>登出</Button>
      </div>
      {tab === "form" && (
        <DynamicExpenseForm
          auth={auth}
          editApplicationId={editApplicationId}
          onDoneEditing={() => setEditApplicationId(null)}
        />
      )}
      {tab === "my-applications" && (
        <div className="min-h-screen bg-slate-50">
          <MyApplications
            auth={auth}
            onEdit={(id) => {
              setEditApplicationId(id);
              setTab("form");
            }}
          />
        </div>
      )}
      {tab === "approvals" && (
        <div className="min-h-screen bg-slate-50">
          <PendingApprovals auth={auth} />
        </div>
      )}
      {tab === "admin" && isAdmin && (
        <div className="min-h-screen bg-slate-50">
          <AdminPanel auth={auth} />
        </div>
      )}
      {tab === "password" && (
        <div className="min-h-screen bg-slate-50">
          <ChangePasswordForm token={auth.token} />
        </div>
      )}
    </div>
  );

  return config ? <BrandingProvider branding={config.branding}>{content}</BrandingProvider> : content;
}

function App() {
  const { auth, login, logout } = useAuth();
  // /platform 是服務供應商管理租戶用的入口，跟一般租戶使用者的登入完全分開一套畫面/token，
  // 用路徑判斷走哪一邊就好，不需要為了這一個分岔另外拉一個路由函式庫進來。
  const isPlatformRoute = window.location.pathname.startsWith("/platform");

  return (
    <QueryClientProvider client={queryClient}>
      {isPlatformRoute ? (
        <PlatformApp />
      ) : auth ? (
        <AuthenticatedApp auth={auth} logout={logout} />
      ) : (
        <LoginForm onLogin={login} />
      )}
    </QueryClientProvider>
  );
}

export default App;
