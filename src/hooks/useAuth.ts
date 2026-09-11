import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getMsalInstance } from "@/lib/msal";
import type { AuthState } from "@/types/auth";

const STORAGE_KEY = "expense-platform-auth";

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

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  const login = useCallback(async (companySlug: string, email: string, password: string) => {
    const result = await apiFetch<AuthState>("/auth/login", {
      method: "POST",
      body: { companySlug, email, password },
    });
    setAuth(result);
    return result;
  }, []);

  // 用 popup 走完整個 Microsoft 登入流程(見 src/lib/msal.ts 為什麼選 popup 不是
  // redirect)，拿到 ID token 後交給後端驗證簽章/發行者/受眾，換成這個系統自己的 JWT——
  // 跟密碼登入一樣，成功後都是呼叫 setAuth 存進 localStorage，後面所有畫面完全不用
  // 分辨使用者當初是用哪種方式登入的。用 getMsalInstance(快取+預熱過的)而不是每次
  // 現場建立、initialize()：loginPopup() 必須是這個點擊事件裡第一個非同步呼叫，
  // 前面如果還插一段 initialize() 的 await，會讓瀏覽器判斷不出這是使用者主動觸發的
  // 彈出視窗而靜默擋掉(見 src/lib/msal.ts 的說明)。
  const loginWithM365 = useCallback(async (companySlug: string, tenantId: string, clientId: string) => {
    // MSAL 用這把 sessionStorage 旗標記錄「現在是不是正在跑一次登入互動」，正常情況下
    // loginPopup() 不管成功或失敗都會自動清掉。但實測過如果上一次互動卡住沒有正常收尾
    // (例如彈跳視窗沒有被正確偵測/關閉)，這把旗標會一直卡著，讓之後每次新嘗試都馬上被
    // MSAL 自己擋下來(interaction_in_progress)，即使那次真正的互動早就不存在了、使用者
    // 也不知道要去手動清瀏覽器儲存空間。每次要開始新的登入嘗試前先清掉它，讓使用者
    // 永遠有辦法重新嘗試，不會被一次卡住的舊互動永久卡住。
    sessionStorage.removeItem("msal.interaction.status");
    try {
      const msalInstance = await getMsalInstance(tenantId, clientId);
      const loginResult = await msalInstance.loginPopup({ scopes: ["openid", "profile", "email"] });
      const result = await apiFetch<AuthState>("/auth/m365/callback", {
        method: "POST",
        body: { companySlug, idToken: loginResult.idToken },
      });
      setAuth(result);
      return result;
    } catch (err) {
      // 目前這條路徑唯一會把詳細錯誤印出來的地方——LoginForm 只在畫面上顯示簡化過的
      // 訊息，實際除錯(例如判斷是不是彈出視窗被擋、還是 Azure App 設定有問題)要靠這裡。
      console.error("Microsoft SSO 登入失敗", err);
      throw err;
    }
  }, []);

  const logout = useCallback(() => setAuth(null), []);

  return { auth, login, loginWithM365, logout };
}
