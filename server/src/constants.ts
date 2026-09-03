// 沿用 trip-expense-form 原本支援的幣別清單。TWD 是隱含的基準幣別(匯率固定 1)，
// 不需要在 ExchangeRate 表裡存一筆，所以獨立出 FOREIGN_CURRENCIES。
export const FOREIGN_CURRENCIES = ["USD", "JPY", "CNY", "EUR"] as const;
export const ALL_CURRENCIES = ["TWD", ...FOREIGN_CURRENCIES] as const;

export type ForeignCurrency = (typeof FOREIGN_CURRENCIES)[number];
export type Currency = (typeof ALL_CURRENCIES)[number];
