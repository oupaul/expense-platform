import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { createMsalInstance } from "@/lib/msal";
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
  // 分辨使用者當初是用哪種方式登入的。
  const loginWithM365 = useCallback(async (companySlug: string, tenantId: string, clientId: string) => {
    const msalInstance = createMsalInstance(tenantId, clientId);
    await msalInstance.initialize();
    const loginResult = await msalInstance.loginPopup({ scopes: ["openid", "profile", "email"] });
    const result = await apiFetch<AuthState>("/auth/m365/callback", {
      method: "POST",
      body: { companySlug, idToken: loginResult.idToken },
    });
    setAuth(result);
    return result;
  }, []);

  const logout = useCallback(() => setAuth(null), []);

  return { auth, login, loginWithM365, logout };
}
