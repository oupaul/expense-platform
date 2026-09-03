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
  }, [branding]);

  return <>{children}</>;
}
