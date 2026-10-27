import type { Prisma } from "@prisma/client";

// 把 Prisma 已知的資料庫錯誤對應成 HTTP 狀態碼與給使用者看的訊息，給全域錯誤處理用。
// 沒列在這裡的錯誤碼回傳 null，交給呼叫端當成真正的伺服器錯誤(500)處理。
// P2025 刻意不區分「不存在」跟「屬於別家公司」：寫入的 where 都帶了 companyId，兩種情況
// 對呼叫端來說就是同一個 404，不洩漏別家公司有沒有這筆資料。
export function prismaErrorResponse(err: Prisma.PrismaClientKnownRequestError): { status: number; message: string } | null {
  switch (err.code) {
    case "P2002": {
      const raw = err.meta?.target;
      const target = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
      if (target.includes("email")) return { status: 409, message: "此 email 已被使用" };
      if (target.includes("slug")) return { status: 409, message: "這個租戶代號已被使用" };
      if (target.includes("name")) return { status: 409, message: "名稱已經存在，請換一個" };
      return { status: 409, message: "資料重複，已經有相同的項目" };
    }
    case "P2025":
      return { status: 404, message: "找不到要操作的資料" };
    case "P2003":
      return { status: 400, message: "所選的關聯資料不存在" };
    case "P2000":
      return { status: 400, message: "輸入的內容過長" };
    case "P2034":
      // 交易寫入衝突/死結：兩個請求同時改同一批資料，資料庫選了一個放棄。對使用者來說跟
      // 「剛剛已經被別人處理過」一樣，重新整理後再試即可。
      return { status: 409, message: "操作衝突，這筆資料剛剛被同時處理了，請重新整理後再試一次" };
    case "P2020":
      return { status: 400, message: "數值超出允許的範圍" };
    default:
      return null;
  }
}
