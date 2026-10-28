// 登入頁的「公司代號」不必每次手動輸入：
// 1. 專屬登入連結 `/?c=acme`：開這條連結公司代號自動帶入並鎖定(給管理員發給員工用)。
// 2. 瀏覽器記住上次成功登入的公司代號，下次打開登入頁自動帶入。
// 公司代號本來就不是機密(公開的公司設定端點用它就查得到)，只記這個，絕不記 email/密碼。

const STORAGE_KEY = "expense-platform-last-company";
const LINK_PARAM = "c";
// 跟平台管理後台建立租戶時的規則一致(小寫英數與連字號)，不符的值一律當作沒有——
// 網址上的參數是別人給的輸入，不能原封不動拿去組 API 路徑。
const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

function normalizeSlug(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  return SLUG_PATTERN.test(value) ? value : null;
}

export function getLinkedCompany(): string | null {
  try {
    return normalizeSlug(new URLSearchParams(window.location.search).get(LINK_PARAM));
  } catch {
    return null;
  }
}

// 使用者按「改用其他公司」之後，把網址上的參數拿掉，重新整理才不會又被鎖回去。
export function clearLinkedCompanyFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(LINK_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    // 拿不掉就算了，不影響登入
  }
}

export function getRememberedCompany(): string | null {
  try {
    return normalizeSlug(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function rememberCompany(slug: string): void {
  const normalized = normalizeSlug(slug);
  if (!normalized) return;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // 無痕模式/儲存空間被封鎖時記不住就算了，下次手動輸入即可
  }
}

// 後台要顯示給管理員複製的專屬登入連結：優先用公司設定的「系統網址」(客戶自己的網域)，
// 沒設定就用目前瀏覽器所在的網址。
export function buildLoginLink(appUrl: string | undefined | null, slug: string): string {
  let base: URL;
  try {
    base = new URL(appUrl || window.location.origin);
  } catch {
    base = new URL(window.location.origin);
  }
  base.search = "";
  base.hash = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.searchParams.set(LINK_PARAM, slug);
  return base.toString();
}
