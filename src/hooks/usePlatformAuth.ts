import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AUTH_EXPIRED_NOTICE, isTokenExpired } from "@/lib/jwt";
import { useAuthExpiry } from "@/hooks/useAuthExpiry";
import type { PlatformAuthState } from "@/types/platform";

// 跟租戶登入用不同的 localStorage key，避免同一台瀏覽器裡平台管理者跟租戶使用者的
// 登入狀態互相覆蓋(例如同一台電腦上，服務供應商自己也是某個示範租戶的使用者)。
const STORAGE_KEY = "expense-platform-platform-auth";

function readStored(): { auth: PlatformAuthState | null; expired: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as PlatformAuthState) : null;
    if (stored && isTokenExpired(stored.token)) return { auth: null, expired: true };
    return { auth: stored, expired: false };
  } catch {
    return { auth: null, expired: false };
  }
}

export function usePlatformAuth() {
  const [initial] = useState(readStored);
  const [auth, setAuth] = useState<PlatformAuthState | null>(initial.auth);
  const [notice, setNotice] = useState<string | null>(initial.expired ? AUTH_EXPIRED_NOTICE : null);
  useAuthExpiry(auth?.token ?? null, () => {
    setAuth(null);
    setNotice(AUTH_EXPIRED_NOTICE);
  });

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<PlatformAuthState>("/platform-auth/login", {
      method: "POST",
      body: { email, password },
    });
    setNotice(null);
    setAuth(result);
    return result;
  }, []);

  const logout = useCallback(() => {
    setNotice(null);
    setAuth(null);
  }, []);

  return { auth, login, logout, notice };
}
