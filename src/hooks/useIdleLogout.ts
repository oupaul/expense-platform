import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"] as const;

interface UseIdleLogoutOptions {
  enabled: boolean;
  onIdle: () => void;
  timeoutMs?: number;
  warningMs?: number;
}

// 閒置太久自動登出——避免有人離開座位、分頁一直開著沒關，其他人就能直接用他的身分
// 操作系統。用 ref 記最後一次有動作的時間(不是每次滑鼠移動都觸發 state 更新去
// re-render，mousemove 一秒可能觸發幾十次)，改用固定頻率的計時器去檢查「距離上次
// 動作過了多久」。快到期前 warningMs 這段時間會先進入警告狀態，讓畫面跳出「還在嗎」
// 的提示；使用者這時候隨便動一下(滑鼠/鍵盤/捲動)就會被視為「還在」而重置，不用
// 特別去點按鈕才算數——按鈕(stayLoggedIn)是給「人在，但剛好沒有動作」的情況用的。
export function useIdleLogout({ enabled, onIdle, timeoutMs = 30 * 60_000, warningMs = 60_000 }: UseIdleLogoutOptions) {
  const lastActivityRef = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    stayLoggedIn();

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      // 只有原本在警告狀態(secondsLeft !== null)才需要清掉重新 render；平常沒有警告時
      // prev 本來就是 null，回傳同一個 null 參照，React 會自己跳過這次 re-render，
      // 高頻率的 mousemove/scroll 才不會白白拖累效能。
      setSecondsLeft((prev) => (prev !== null ? null : prev));
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    const interval = setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= timeoutMs) {
        onIdle();
        return;
      }
      setSecondsLeft(idleFor >= timeoutMs - warningMs ? Math.ceil((timeoutMs - idleFor) / 1000) : null);
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      clearInterval(interval);
    };
  }, [enabled, onIdle, timeoutMs, warningMs, stayLoggedIn]);

  return { secondsLeft, stayLoggedIn };
}
