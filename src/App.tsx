import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DynamicExpenseForm } from "@/components/DynamicExpenseForm";
import { PendingApprovals } from "@/components/PendingApprovals";
import { MyApplications } from "@/components/MyApplications";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { AuthState } from "@/types/auth";

const queryClient = new QueryClient();

type Tab = "form" | "my-applications" | "approvals" | "admin" | "password";

function AuthenticatedApp({ auth, logout }: { auth: AuthState; logout: () => void }) {
  const [tab, setTab] = useState<Tab>("form");
  const isAdmin = auth.user.role === "admin";

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

  return (
    <div>
      {/* sticky 而非 fixed：佔用實際版面高度、把下面內容往下推，
          不會疊在公司名稱上面(手機窄螢幕尤其明顯)。flex-wrap 讓按鈕在窄螢幕自動換行。 */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b bg-white/95 px-4 py-2 shadow-sm print:hidden">
        {tabButton("form", "填寫申請單")}
        {tabButton("my-applications", "我的申請")}
        {tabButton("approvals", "待簽核")}
        {isAdmin && tabButton("admin", "後台管理")}
        {tabButton("password", "修改密碼")}
        <span className="px-2 text-xs text-slate-400">{auth.user.name}({auth.user.role})</span>
        <Button variant="ghost" size="sm" onClick={logout}>登出</Button>
      </div>
      {tab === "form" && <DynamicExpenseForm auth={auth} />}
      {tab === "my-applications" && (
        <div className="min-h-screen bg-slate-50">
          <MyApplications auth={auth} />
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
          <ChangePasswordForm auth={auth} />
        </div>
      )}
    </div>
  );
}

function App() {
  const { auth, login, logout } = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      {auth ? <AuthenticatedApp auth={auth} logout={logout} /> : <LoginForm onLogin={login} />}
    </QueryClientProvider>
  );
}

export default App;
