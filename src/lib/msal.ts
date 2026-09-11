import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

// 每家租戶的 Azure AD tenant/client id 不一樣，沒辦法共用一個全域的 MSAL 單例，
// 依這家公司的設定現建一個、用 tenantId+clientId 當 key 快取起來(見下面
// getMsalInstance)。tenantId/clientId 都不是密鑰——SPA 型態的 Azure App 註冊搭配
// PKCE 本來就不會有 Client Secret，這裡也就沒有任何密鑰要處理。
function createMsalInstance(tenantId: string, clientId: string): PublicClientApplication {
  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      // 用 loginPopup 而不是 loginRedirect：這個應用程式沒有前端路由，是單一頁面
      // 用畫面上的分頁切換渲染不同區塊，redirect flow 會讓整個分頁重新載入、還要
      // 額外處理「回來之後怎麼知道剛才是哪家公司在登入」的狀態保存問題。
      cacheLocation: "sessionStorage",
    },
  };
  return new PublicClientApplication(config);
}

const instanceCache = new Map<string, Promise<PublicClientApplication>>();

// PublicClientApplication 建立後一定要呼叫過一次 initialize() 才能用，但 initialize()
// 是非同步的——如果每次點「使用 Microsoft 帳號登入」才臨時 new 一個、當場 await
// initialize() 再呼叫 loginPopup()，這個 await 會讓 window.open() 跟使用者的點擊事件
// 之間多一段非同步空檔。瀏覽器判斷「這是不是使用者主動觸發的彈出視窗」很看這個時間差，
// 空檔一拉長，有些瀏覽器就會把彈出視窗直接靜默擋掉(不會跳出任何提示，MSAL 那邊噴的
// 也只是很籠統的錯誤，很難診斷)。這裡改成「一知道這家公司的 tenantId/clientId(通常是
// 登入頁打開、公司代號打完 debounce 查到設定的當下)就先建好、initialize 完放進快取」，
// 真正點下按鈕時 loginPopup() 才是那個點擊事件裡第一個非同步呼叫，跟使用者這次點擊
// 的關聯才夠緊密，不會被誤判成非使用者主動開的彈出視窗。
export function prewarmMsalInstance(tenantId: string, clientId: string): void {
  // 預熱失敗不用特別處理——快取裡失敗的 Promise 會被 getMsalInstance 內部的
  // catch 清掉，真正登入時會重新嘗試一次，使用者點下按鈕時才會看到錯誤。
  getMsalInstance(tenantId, clientId).catch(() => {});
}

export function getMsalInstance(tenantId: string, clientId: string): Promise<PublicClientApplication> {
  const key = `${tenantId}:${clientId}`;
  let cached = instanceCache.get(key);
  if (!cached) {
    cached = (async () => {
      const instance = createMsalInstance(tenantId, clientId);
      await instance.initialize();
      return instance;
    })();
    cached.catch(() => instanceCache.delete(key));
    instanceCache.set(key, cached);
  }
  return cached;
}
