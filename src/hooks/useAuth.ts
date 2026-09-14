import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getMsalInstance } from "@/lib/msal";
import type { AuthState } from "@/types/auth";

const STORAGE_KEY = "expense-platform-auth";
// loginRedirect 會把整個分頁導去 Microsoft、登入完再導回來，跟原本觸發登入的那次
// function call 完全是兩次不同的頁面生命週期，沒辦法用一般的 Promise/await 把「登入完
// 之後要做什麼」接在同一段程式碼裡——只能先把「這次是哪家公司、要用哪組 tenantId/
// clientId」存起來，等應用程式重新啟動、發現是從 Microsoft 導回來的，再接手把登入完成。
const M365_PENDING_KEY = "expense-platform-m365-pending";

interface M365Pending {
  companySlug: string;
  tenantId: string;
  clientId: string;
}

function readStored(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState | null>(() => readStored());
  // 應用程式剛啟動、還在檢查「這次是不是從 Microsoft 登入導回來的」這段期間的過渡狀態，
  // 讓 LoginForm 可以先顯示「登入處理中」，不要讓使用者誤以為畫面卡住或登入失敗。
  const [m365Processing, setM365Processing] = useState(false);
  const [m365Error, setM365Error] = useState<string | null>(null);

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  // 每次應用程式啟動都要檢查一次：這次載入是不是剛從 Microsoft 登入導回來的。
  // 只執行一次(依賴陣列是空的)，正常情況(沒有待處理的 M365 登入)這裡幾乎立刻結束。
  useEffect(() => {
    const pendingRaw = sessionStorage.getItem(M365_PENDING_KEY);
    if (!pendingRaw) return;

    let pending: M365Pending;
    try {
      pending = JSON.parse(pendingRaw) as M365Pending;
    } catch {
      sessionStorage.removeItem(M365_PENDING_KEY);
      return;
    }

    setM365Processing(true);
    (async () => {
      try {
        const msalInstance = await getMsalInstance(pending.tenantId, pending.clientId);
        const redirectResult = await msalInstance.handleRedirectPromise();
        // 回傳 null 代表這次載入其實不是 Microsoft 導回來的結果(例如使用者存了這把
        // sessionStorage 之後又直接重新整理頁面、沒有真的去登入)，安靜結束就好，
        // 不用當成錯誤顯示給使用者看。
        if (!redirectResult) return;

        const result = await apiFetch<AuthState>("/auth/m365/callback", {
          method: "POST",
          body: { companySlug: pending.companySlug, idToken: redirectResult.idToken },
        });
        setAuth(result);
      } catch (err) {
        // 這裡是登入完導回來後唯一能顯示詳細錯誤的地方——這時候已經是全新的一次
        // 應用程式啟動，原本觸發登入那次點擊的 catch/finally 早就不存在了。
        console.error("Microsoft SSO 登入失敗", err);
        setM365Error(err instanceof Error ? err.message : "Microsoft 登入失敗，請重新嘗試");
      } finally {
        sessionStorage.removeItem(M365_PENDING_KEY);
        setM365Processing(false);
      }
    })();
  }, []);

  const login = useCallback(async (companySlug: string, email: string, password: string) => {
    const result = await apiFetch<AuthState>("/auth/login", {
      method: "POST",
      body: { companySlug, email, password },
    });
    setAuth(result);
    return result;
  }, []);

  // 用 loginRedirect 而不是 loginPopup：後者需要主視窗在背景監看彈跳視窗的網址、
  // 偵測到登入完成後主動關掉它，這個「跨視窗互相監看」的機制實測在某些部署環境下
  // (例如透過 Cloudflare Tunnel 對外)會失效——彈跳視窗登入完導回來，主視窗卻永遠
  // 偵測不到，卡在「登入中」動不了。loginRedirect 整個分頁直接導去 Microsoft、
  // 登入完再導回同一個分頁，完全不需要任何跨視窗溝通，從根本上避開這類問題。
  const loginWithM365 = useCallback(async (companySlug: string, tenantId: string, clientId: string) => {
    // 跟 msal.interaction.status 這把旗標卡住的問題一樣(見先前 commit)：如果使用者
    // 上次半途放棄登入(直接關掉分頁、按上一頁)，導回來的那次 handleRedirectPromise()
    // 就沒有機會執行、清掉這把旗標，之後每次重新嘗試都會被 MSAL 自己擋下來。
    // 每次要開始新的登入嘗試前先清掉它，確保使用者永遠有辦法重新嘗試。
    sessionStorage.removeItem("msal.interaction.status");
    const pending: M365Pending = { companySlug, tenantId, clientId };
    sessionStorage.setItem(M365_PENDING_KEY, JSON.stringify(pending));
    const msalInstance = await getMsalInstance(tenantId, clientId);
    await msalInstance.loginRedirect({ scopes: ["openid", "profile", "email"] });
    // loginRedirect 成功呼叫的話，瀏覽器這時候已經在導去 Microsoft 的路上，
    // 這行以下(包括呼叫端 await 之後的程式碼)不會真的執行到。
  }, []);

  const logout = useCallback(() => setAuth(null), []);

  return { auth, login, loginWithM365, logout, m365Processing, m365Error };
}
