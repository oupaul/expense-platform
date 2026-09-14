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
      // loginRedirect 會把整個分頁導去 Microsoft、登入完再導回來，這份快取要撐過
      // 那次整頁重新載入才讀得到登入結果，sessionStorage 在同一個分頁的整頁導轉
      // 前後是同一份，符合這個需求(跟 localStorage 的差別只在於不會被其他分頁看到)。
      cacheLocation: "sessionStorage",
    },
  };
  return new PublicClientApplication(config);
}

const instanceCache = new Map<string, Promise<PublicClientApplication>>();

// PublicClientApplication 建立後一定要呼叫過一次 initialize() 才能用。這裡用
// tenantId+clientId 當 key 快取起來，一知道這家公司的設定(登入頁打開、公司代號打完
// debounce 查到設定的當下)就先建好、initialize 完，不用每次呼叫都重新等一次。
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
