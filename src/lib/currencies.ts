// 對應後端 server/src/constants.ts 的幣別清單，前後端各自維護一份常數即可，
// 不需要跨專案 import(前端是 Vite/瀏覽器環境，後端是 Node，兩邊本來就不共用程式碼)。
export const FOREIGN_CURRENCIES = ["USD", "JPY", "CNY", "EUR"] as const;
export const ALL_CURRENCIES = ["TWD", ...FOREIGN_CURRENCIES] as const;
