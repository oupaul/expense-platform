import { Button } from "@/components/ui/button";

// 閒置逾時前的最後警告——蓋在整個畫面上方(z-index 要蓋過其他既有的 fixed/absolute
// 元素，例如導覽列的 sticky top-0 跟 NotificationBell 的下拉選單)，不能點背景關掉，
// 逼使用者要嘛按「我還在」，要嘛放著讓它自動登出，避免誤觸背景以為自己還登入著。
export function IdleWarningDialog({ secondsLeft, onStay, onLogoutNow }: { secondsLeft: number; onStay: () => void; onLogoutNow: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 print:hidden">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold">閒置過久，即將自動登出</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          為了帳號安全，閒置一段時間沒有操作會自動登出。還在使用的話，請按下方按鈕繼續。
        </p>
        <p className="mt-4 text-3xl font-bold text-destructive">{secondsLeft} 秒</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onLogoutNow}>
            立即登出
          </Button>
          <Button onClick={onStay}>我還在，繼續使用</Button>
        </div>
      </div>
    </div>
  );
}
