import { useState, Suspense, lazy } from "react";
import { PlatformLoginForm } from "@/components/platform/PlatformLoginForm";
import { PlatformDashboard } from "@/components/platform/PlatformDashboard";
import { PlatformAdminManager } from "@/components/platform/PlatformAdminManager";
import { BackupSettings } from "@/components/platform/BackupSettings";
import { NotificationSettings } from "@/components/platform/NotificationSettings";
import { ActiveSessions } from "@/components/platform/ActiveSessions";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { IdleWarningDialog } from "@/components/IdleWarningDialog";
import { Button } from "@/components/ui/button";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { useIdleLogout } from "@/hooks/useIdleLogout";

// 動態載入：跟租戶端的報表一樣，recharts 很重，平台管理者不見得每次登入都會點報表。
const PlatformReports = lazy(() =>
  import("@/components/platform/PlatformReports").then((m) => ({ default: m.PlatformReports }))
);

type Tab = "companies" | "admins" | "backup" | "notifications" | "reports" | "sessions" | "password";

// 服務供應商的平台管理入口，走 /platform 這個路徑，跟租戶使用者的一般登入(LoginForm)
// 完全分開一套畫面、一組 token，不會混在一起。
export function PlatformApp() {
  const { auth, login, logout } = usePlatformAuth();
  const [tab, setTab] = useState<Tab>("companies");
  // 平台管理者的權限比一般租戶使用者更高(能建租戶、重設任何 admin 的密碼)，閒置
  // 自動登出這件事同樣重要，甚至更重要，見 src/hooks/useIdleLogout.ts 的完整說明。
  const { secondsLeft, stayLoggedIn } = useIdleLogout({ enabled: !!auth, onIdle: logout });

  if (!auth) return <PlatformLoginForm onLogin={login} />;

  return (
    <div className="min-h-screen bg-slate-50">
      {secondsLeft !== null && <IdleWarningDialog secondsLeft={secondsLeft} onStay={stayLoggedIn} onLogoutNow={logout} />}
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
          onClick={() => setTab("admins")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "admins" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          平台管理者
        </button>
        <button
          onClick={() => setTab("backup")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "backup" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          備份
        </button>
        <button
          onClick={() => setTab("notifications")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "notifications" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          通知
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "reports" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          報表
        </button>
        <button
          onClick={() => setTab("sessions")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "sessions" ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          使用狀況
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
      {tab === "admins" && <PlatformAdminManager token={auth.token} currentAdminId={auth.admin.id} />}
      {tab === "backup" && <BackupSettings token={auth.token} />}
      {tab === "notifications" && <NotificationSettings token={auth.token} />}
      {tab === "reports" && (
        <Suspense fallback={<div className="p-8 text-center text-muted-foreground">載入報表模組中…</div>}>
          <PlatformReports token={auth.token} />
        </Suspense>
      )}
      {tab === "sessions" && <ActiveSessions token={auth.token} />}
      {tab === "password" && (
        <div className="p-8">
          <ChangePasswordForm token={auth.token} path="/platform-auth/change-password" />
        </div>
      )}
    </div>
  );
}
