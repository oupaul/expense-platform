import { useState } from "react";
import { PlatformLoginForm } from "@/components/platform/PlatformLoginForm";
import { PlatformDashboard } from "@/components/platform/PlatformDashboard";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";

type Tab = "companies" | "password";

// 服務供應商的平台管理入口，走 /platform 這個路徑，跟租戶使用者的一般登入(LoginForm)
// 完全分開一套畫面、一組 token，不會混在一起。
export function PlatformApp() {
  const { auth, login, logout } = usePlatformAuth();
  const [tab, setTab] = useState<Tab>("companies");

  if (!auth) return <PlatformLoginForm onLogin={login} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex items-center justify-center gap-2 border-b bg-slate-900 px-4 py-2 text-white">
        <button
          onClick={() => setTab("companies")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "companies" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          租戶管理
        </button>
        <button
          onClick={() => setTab("password")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "password" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          修改密碼
        </button>
        <span className="px-2 text-xs text-slate-400">{auth.admin.name}</span>
        <Button variant="ghost" size="sm" className="text-white hover:bg-slate-800 hover:text-white" onClick={logout}>
          登出
        </Button>
      </div>
      {tab === "companies" && <PlatformDashboard token={auth.token} />}
      {tab === "password" && (
        <div className="p-8">
          <ChangePasswordForm token={auth.token} path="/platform-auth/change-password" />
        </div>
      )}
    </div>
  );
}
