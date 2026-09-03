import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
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

  const logout = useCallback(() => setAuth(null), []);

  return { auth, login, logout };
}
