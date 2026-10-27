import { useEffect, useRef } from "react";
import { subscribeAuthExpired } from "@/lib/api";
import { isTokenExpired } from "@/lib/jwt";

const CHECK_INTERVAL_MS = 60_000;

// 登入憑證(固定 8 小時)過期時要自動回到登入頁，而不是讓畫面停在「看起來已登入、但每個請求
// 都失敗」的狀態。三條路徑都會觸發 onExpired：
// 1. 任何請求收到後端的 AUTH_EXPIRED/AUTH_REQUIRED(例如伺服器換了 JWT_SECRET 也算)。
// 2. 每分鐘檢查一次 token 的 exp。
// 3. 使用者切回這個分頁時立刻檢查(電腦睡眠、分頁放了一整晚，計時器不一定準時醒來)。
export function useAuthExpiry(token: string | null, onExpired: () => void) {
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  });

  useEffect(() => {
    if (!token) return;
    const check = () => {
      if (isTokenExpired(token)) onExpiredRef.current();
    };
    const unsubscribe = subscribeAuthExpired((expiredToken) => {
      if (expiredToken === token) onExpiredRef.current();
    });
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);
}
