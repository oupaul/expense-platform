import { useQuery } from "@tanstack/react-query";
import type { CompanyFormConfig } from "@/types/company-config";

// 查無此公司(404)重試沒有意義，登入頁要立刻告訴使用者「找不到這個公司代號」，不能讓人
// 等 react-query 預設的重試退避時間(約 7 秒)才看到提示。
class CompanyNotFoundError extends Error {}

async function fetchCompanyConfig(companyId: string): Promise<CompanyFormConfig> {
  const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}/config`);
  if (res.status === 404) throw new CompanyNotFoundError("找不到這家公司");
  if (!res.ok) {
    throw new Error(`無法載入公司表單設定 (${res.status})`);
  }
  return res.json();
}

export function useCompanyConfig(companyId: string) {
  return useQuery({
    queryKey: ["company-config", companyId],
    queryFn: () => fetchCompanyConfig(companyId),
    staleTime: 5 * 60 * 1000, // 品牌/選項資料不常變動，快取 5 分鐘即可
    // 登入頁在使用者打公司代號時就會用這支 hook 即時查詢，字還沒打完(空字串)
    // 不該真的送出一個 /api/companies//config 這種畸形的請求。
    enabled: !!companyId,
    retry: (failureCount, error) => !(error instanceof CompanyNotFoundError) && failureCount < 3,
  });
}
