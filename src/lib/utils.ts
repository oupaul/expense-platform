import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 金額顯示一律加千位數分隔符號，方便閱讀大數字——後端 Decimal 欄位序列化成 JSON 後
// 是字串(例如 totalAmountTWD)，這裡統一用 Number() 轉換再格式化，呼叫端不用各自處理。
// 不要用在可編輯的 <input type="number">：那種欄位本來就不支援逗號，硬塞會壞掉，
// 只用在唯讀顯示的地方。
export function formatAmount(value: number | string): string {
  return Number(value).toLocaleString("zh-TW")
}
