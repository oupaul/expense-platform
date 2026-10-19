import type { PrintSummary } from "@/types/application";

// 清單用的列印狀態小標籤。記的是「開啟過列印」(瀏覽器無從得知最後是否真的印出)，
// 滑鼠停上去可以看到最近一次是誰、什麼時候。草稿不會有列印紀錄，呼叫端不要對草稿顯示。
export function PrintStatusBadge({ print }: { print: PrintSummary }) {
  if (print.count === 0 || !print.lastPrintedAt) {
    return <span className="text-xs text-muted-foreground">未列印</span>;
  }
  const title = `最近：${new Date(print.lastPrintedAt).toLocaleString("zh-TW")}(${print.lastPrintedByName ?? "-"})`;
  return (
    <span className="text-xs text-green-700" title={title}>
      已列印 {print.count} 次
    </span>
  );
}
