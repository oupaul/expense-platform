import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import type { AuthState } from "@/types/auth";
import type { NotificationItem } from "@/types/notification";

interface Props {
  auth: AuthState;
  // 通知點下去除了標記已讀，也順便帶使用者跳到相關分頁——待簽核通知(submitted)是給
  // 簽核者看的，跳「待簽核」；核准/駁回/退回是給申請人看的，跳「我的申請」。
  onNavigate: (tab: "my-applications" | "approvals") => void;
}

function targetTab(type: NotificationItem["type"]): "my-applications" | "approvals" {
  return type === "submitted" ? "approvals" : "my-applications";
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function NotificationBell({ auth, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const { data, markRead, markAllRead } = useNotifications(auth);
  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) markRead.mutate(item.id);
    setOpen(false);
    onNavigate(targetTab(item.type));
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="通知"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* 全螢幕透明遮罩：點外面關掉面板，不用另外掛 document click listener。 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">通知</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
                  全部標為已讀
                </Button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">目前沒有通知</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${
                    item.read ? "text-slate-500" : "bg-blue-50/60 font-medium text-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span>{item.title}</span>
                    {!item.read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                  </div>
                  <p className="mt-0.5 font-normal text-slate-500">{item.message}</p>
                  <p className="mt-1 text-xs font-normal text-slate-400">{timeAgo(item.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
