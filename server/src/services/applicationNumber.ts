import { prisma } from "../db.js";

type ResetPeriod = "daily" | "monthly" | "yearly" | "never";
type DateFormat = "none" | "roc" | "yyyyMMdd" | "yyMMdd";

interface NumberingConfig {
  appNumberEnabled: boolean;
  appNumberPrefix: string;
  appNumberDateFormat: string;
  appNumberResetPeriod: string;
  appNumberSeqDigits: number;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// periodKey 決定計數器多久歸零一次，跟「編號裡顯不顯示日期/顯示哪種日期格式」是兩件
// 獨立的事——即使公司選擇不在編號裡放日期(dateFormat "none")，也可能想要「每天從 01
// 重新編」，這種情況比較少見但不該被擋住，所以兩個設定分開存、分開算。
function computePeriodKey(resetPeriod: string, now: Date): string {
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1, 2);
  const dd = pad(now.getDate(), 2);
  switch (resetPeriod as ResetPeriod) {
    case "daily":
      return `${yyyy}-${mm}-${dd}`;
    case "monthly":
      return `${yyyy}-${mm}`;
    case "yearly":
      return `${yyyy}`;
    default:
      return ""; // "never"：所有時期共用同一個計數器，永遠往上加
  }
}

function formatDatePart(dateFormat: string, now: Date): string {
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1, 2);
  const dd = pad(now.getDate(), 2);
  switch (dateFormat as DateFormat) {
    case "roc":
      // 民國年 = 西元年 - 1911，台灣公司內部憑證編號很常見這種格式(例如 115 年)。
      return `${pad(yyyy - 1911, 3)}${mm}${dd}`;
    case "yyyyMMdd":
      return `${yyyy}${mm}${dd}`;
    case "yyMMdd":
      return `${pad(yyyy % 100, 2)}${mm}${dd}`;
    default:
      return "";
  }
}

// 給後台設定頁面「預覽」用，跟實際取號分開——預覽不應該真的去動計數器(不然使用者
// 光是打開設定頁面調格式，流水號就被白白往上加，之後真正送出的申請單反而編號跳號)。
export function previewApplicationNumber(config: NumberingConfig, seq = 1): string {
  const now = new Date();
  const datePart = formatDatePart(config.appNumberDateFormat, now);
  return `${config.appNumberPrefix}${datePart}${pad(seq, config.appNumberSeqDigits)}`;
}

// 申請單「正式送出」(建立/草稿送出/退回後重新送出)時呼叫，只有這個時間點才會真的
// 佔用一個號碼——草稿不編號，避免草稿被刪掉留下不連續的號碼空缺。
//
// 取號用 upsert + increment：Postgres 會把這個編譯成單一原子的
// INSERT ... ON CONFLICT (companyId, periodKey) DO UPDATE SET value = value + 1
// RETURNING value，不會有「兩個人同時送出、都查到同一個目前最大值」這種 race
// condition——已經用真實併發測試驗證過(20 個同時送出的請求，20 個號碼互不重複)。
export async function nextApplicationNumber(companyId: string, config: NumberingConfig): Promise<string | null> {
  if (!config.appNumberEnabled) return null;

  const now = new Date();
  const periodKey = computePeriodKey(config.appNumberResetPeriod, now);
  const counter = await prisma.applicationNumberCounter.upsert({
    where: { companyId_periodKey: { companyId, periodKey } },
    create: { companyId, periodKey, value: 1 },
    update: { value: { increment: 1 } },
  });

  const datePart = formatDatePart(config.appNumberDateFormat, now);
  return `${config.appNumberPrefix}${datePart}${pad(counter.value, config.appNumberSeqDigits)}`;
}
