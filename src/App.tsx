import { useState, Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DynamicExpenseForm } from "@/components/DynamicExpenseForm";
import { PendingApprovals } from "@/components/PendingApprovals";
import { MyApplications } from "@/components/MyApplications";
import { AdminPanel } from "@/components/admin/AdminPanel";
// 動態載入：報表用到的 recharts 一次就加了 400KB+ 的打包體積，但只有 admin 會點進「報表」，
// 大部分使用者(申請人/簽核者)一次都不會用到，不該讓每個人一開頁面就先付這筆下載成本。
const ReportsView = lazy(() => import("@/components/admin/ReportsView").then((m) => ({ default: m.ReportsView })));
import { LoginForm } from "@/components/LoginForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { PlatformApp } from "@/components/platform/PlatformApp";
import { BrandingProvider } from "@/components/BrandingProvider";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import type { AuthState } from "@/types/auth";

const queryClient = new QueryClient();

type Tab = "form" | "my-applications" | "approvals" | "reports" | "admin" | "password";

function AuthenticatedApp({ auth, logout }: { auth: AuthState; logout: () => void }) {
  const [tab, setTab] = useState<Tab>("form");
  // 從「我的申請」點「編輯並重新送出」被退回的申請單時，帶著 id 切到填寫申請單分頁，
  // 讓 DynamicExpenseForm 用既有內容預填、走 resubmit 而不是建立新的一張。
  const [editApplicationId, setEditApplicationId] = useState<string | null>(null);
  const isAdmin = auth.user.role === "admin";
  // 報表跟「查看全部申請單」開放給 admin，或是被個別指定 canViewAllReports 的人——
  // 這些人不會因此拿到後台管理(使用者/簽核關卡設定)或簽核的權限，純粹只能看。
  const canViewReports = isAdmin || auth.user.canViewAllReports;
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
      {/* bg-white 必須完全不透明——曾經用 bg-white/95，滾動後導覽列固定在頂部時，
          底下費用申請單的品牌色 header(公司名稱／「費用申請單」字樣)會從 5% 透光處
          透出來，跟導覽列的分頁文字疊在一起，手機窄螢幕尤其明顯難以辨識。 */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b bg-white px-4 py-2 shadow-sm print:hidden">
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
        {canViewReports && tabButton("reports", "報表")}
        {isAdmin && tabButton("admin", "後台管理")}
        {tabButton("password", "修改密碼")}
        <NotificationBell auth={auth} onNavigate={setTab} />
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
      {/* 這幾個分頁本身平常不需要列印，print:hidden 讓它們在進入列印模式時完全消失——
          真正要印出來的內容(ApplicationDetail 裡的申請單) 是用 portal 直接掛在
          document.body 上，不在這個會被隱藏的子樹裡，不受影響。「填寫申請單」那個分頁
          不能套用同樣的 print:hidden，它自己內部就有一組跟編輯畫面互斥的列印版面，
          兩者是同一層的手足元素，把整個分頁包起來隱藏會連它自己的列印版面也一起藏掉。 */}
      {tab === "my-applications" && (
        <div className="min-h-screen bg-slate-50 print:hidden">
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
        <div className="min-h-screen bg-slate-50 print:hidden">
          <PendingApprovals auth={auth} />
        </div>
      )}
      {tab === "reports" && canViewReports && (
        <div className="min-h-screen bg-slate-50 print:hidden">
          <Suspense fallback={<div className="p-8 text-center text-muted-foreground">載入報表模組中…</div>}>
            <ReportsView auth={auth} />
          </Suspense>
        </div>
      )}
      {tab === "admin" && isAdmin && (
        <div className="min-h-screen bg-slate-50 print:hidden">
          <AdminPanel auth={auth} />
        </div>
      )}
      {tab === "password" && (
        <div className="min-h-screen bg-slate-50 print:hidden">
          <ChangePasswordForm token={auth.token} />
        </div>
      )}
    </div>
  );

  return config ? <BrandingProvider branding={config.branding}>{content}</BrandingProvider> : content;
}

// MSAL 用彈跳視窗登入 M365 時，Microsoft 登入完會把「這個」網域(跟主視窗一模一樣的網址)
// 導回到彈跳視窗裡——正常情況下主視窗會在背景偵測到、把這個彈跳視窗的內容讀出來後主動
// 關掉，使用者幾乎看不到它；但如果那個偵測/關閉的動作沒發生(例如網路異常、逾時)，這個
// 彈跳視窗就會像一般分頁一樣把我們整個系統重新整個載入一次，長得跟主視窗一模一樣，
// 使用者很容易誤以為這才是登入頁、在裡面又點一次「使用 Microsoft 帳號登入」，結果撞上
// MSAL 的 block_nested_popups 保護(不能在彈跳視窗裡面再開一個彈跳視窗)，看起來像是
// 「登入完又失敗」，其實只是點錯了視窗。這裡偵測「這個頁面是不是被別的視窗開出來的
// 彈跳視窗、網址又帶著 Microsoft 登入回傳的 code/error」，符合的話就不要渲染整個正常
// 系統畫面(尤其是那顆會誤觸的 M365 登入按鈕)，改顯示提示文字，請使用者回到原本視窗。
function isStaleM365PopupCallback(): boolean {
  if (!window.opener || window.opener === window) return false;
  return /[?#].*\b(code|error)=/.test(window.location.href);
}

function App() {
  const { auth, login, loginWithM365, logout } = useAuth();
  // /platform 是服務供應商管理租戶用的入口，跟一般租戶使用者的登入完全分開一套畫面/token，
  // 用路徑判斷走哪一邊就好，不需要為了這一個分岔另外拉一個路由函式庫進來。
  const isPlatformRoute = window.location.pathname.startsWith("/platform");

  if (isStaleM365PopupCallback()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-8 text-center">
        <div className="max-w-sm space-y-2">
          <p className="font-medium">Microsoft 登入處理中…</p>
          <p className="text-sm text-muted-foreground">
            這個視窗應該會自動關閉並回到原本的頁面。如果沒有自動關閉，請直接關閉這個視窗，
            回到原本的登入頁重新整理後再試一次。
          </p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {isPlatformRoute ? (
        <PlatformApp />
      ) : auth ? (
        <AuthenticatedApp auth={auth} logout={logout} />
      ) : (
        <LoginForm onLogin={login} onLoginWithM365={loginWithM365} />
      )}
    </QueryClientProvider>
  );
}

export default App;
