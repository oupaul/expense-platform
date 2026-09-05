import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { PlatformAuthState } from "@/types/platform";

// 跟租戶登入用不同的 localStorage key，避免同一台瀏覽器裡平台管理者跟租戶使用者的
// 登入狀態互相覆蓋(例如同一台電腦上，服務供應商自己也是某個示範租戶的使用者)。
const STORAGE_KEY = "expense-platform-platform-auth";

function readStored(): PlatformAuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlatformAuthState) : null;
  } catch {
    return null;
  }
}

export function usePlatformAuth() {
  const [auth, setAuth] = useState<PlatformAuthState | null>(() => readStored());

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<PlatformAuthState>("/platform-auth/login", {
      method: "POST",
      body: { email, password },
    });
    setAuth(result);
    return result;
  }, []);

  const logout = useCallback(() => setAuth(null), []);

  return { auth, login, logout };
}
