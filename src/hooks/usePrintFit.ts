import { useEffect } from "react";

// A4 可用高度(扣掉上下各 15mm 邊界)換算成 px，跟 index.css 裡 @page 的邊界設定要一致。
const MM_TO_PX = 96 / 25.4;
const PAGE_HEIGHT_PX = (297 - 30) * MM_TO_PX;

// 單頁列印時，如果內容超過一張 A4 的高度，就整體等比縮小塞進一頁 —— 直接翻譯自
// 原始 hzt-expense 版型的 fitPrintToOnePage()，只是改成用 React 的生命週期掛勾。
// 分頁列印(pages.length > 1)不需要這個，enabled 傳 false 即可。
export function usePrintFit(ref: React.RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const applyFit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = "";
      el.style.transformOrigin = "top left";
      const contentHeight = el.scrollHeight;
      if (contentHeight > PAGE_HEIGHT_PX) {
        const scale = PAGE_HEIGHT_PX / contentHeight;
        el.style.transform = `scale(${scale})`;
      }
    };

    const reset = () => {
      const el = ref.current;
      if (el) el.style.transform = "";
    };

    window.addEventListener("beforeprint", applyFit);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", applyFit);
      window.removeEventListener("afterprint", reset);
    };
  }, [ref, enabled]);
}
