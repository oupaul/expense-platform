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
      <div className="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 p-1 shadow-lg print:hidden">
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
        <div className="min-h-screen bg-slate-50 pt-20">
          <MyApplications auth={auth} />
        </div>
      )}
      {tab === "approvals" && (
        <div className="min-h-screen bg-slate-50 pt-20">
          <PendingApprovals auth={auth} />
        </div>
      )}
      {tab === "admin" && isAdmin && (
        <div className="min-h-screen bg-slate-50 pt-20">
          <AdminPanel auth={auth} />
        </div>
      )}
      {tab === "password" && (
        <div className="min-h-screen bg-slate-50 pt-20">
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
