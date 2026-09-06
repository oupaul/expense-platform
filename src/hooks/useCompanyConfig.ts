import { useQuery } from "@tanstack/react-query";
import type { CompanyFormConfig } from "@/types/company-config";

async function fetchCompanyConfig(companyId: string): Promise<CompanyFormConfig> {
  const res = await fetch(`/api/companies/${companyId}/config`);
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
  });
}
