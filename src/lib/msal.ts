import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

// 每家租戶的 Azure AD tenant/client id 不一樣，沒辦法共用一個全域的 MSAL 單例，
// 登入當下才依這家公司的設定現建一個。tenantId/clientId 都不是密鑰——SPA 型態的
// Azure App 註冊搭配 PKCE 本來就不會有 Client Secret，這裡也就沒有任何密鑰要處理。
export function createMsalInstance(tenantId: string, clientId: string): PublicClientApplication {
  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      // 用 loginPopup 而不是 loginRedirect：這個應用程式沒有前端路由，是單一頁面
      // 用畫面上的分頁切換渲染不同區塊，redirect flow 會讓整個分頁重新載入、還要
      // 額外處理「回來之後怎麼知道剛才是哪家公司在登入」的狀態保存問題；popup 從
      // 使用者點擊按鈕的同一個事件觸發，不會被瀏覽器的彈出視窗攔截器擋掉，整個
      // 登入流程可以留在同一個 await 裡處理完，不用碰 sessionStorage 之類的機制。
      cacheLocation: "sessionStorage",
    },
  };
  return new PublicClientApplication(config);
}
