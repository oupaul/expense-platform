import { useEffect } from "react";
import type { Branding } from "@/types/company-config";

// 把公司設定的顏色寫進 CSS variable，shadcn 的元件本來就吃 --primary 這類 token，
// 所以不用另外改元件樣式，只要在最外層套用這支 component 就會全站變色。
export function BrandingProvider({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--brand-primary", branding.primaryColor);
    root.setProperty("--brand-header-bg", branding.headerBgColor);
    root.setProperty("--brand-gradient-from", branding.gradientFrom);
    root.setProperty("--brand-gradient-to", branding.gradientTo);

    // 瀏覽器分頁的標題/圖示：登入前不知道是哪個租戶，只能顯示 index.html 裡的預設值；
    // 登入後才拿得到公司設定，這裡改掉。logoUrl 沒設定就維持預設 favicon，不用特別清掉。
    document.title = branding.name;
    if (branding.logoUrl) {
      const link = document.getElementById("app-favicon") as HTMLLinkElement | null;
      if (link) link.href = branding.logoUrl;
    }
  }, [branding]);

  return <>{children}</>;
}
