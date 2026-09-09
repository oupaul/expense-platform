import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

// SortableTableRow 的卡片版——CustomFieldManager 是卡片式版面(select 型欄位還要往下
// 展開選項管理)，不是像 OptionManager 那樣單純一張表，沒辦法直接套 <TableRow>，
// 拖曳邏輯一樣抽出來共用，只是外層容器換成 <div>。
export function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 rounded border p-3 ${isDragging ? "relative z-10 bg-slate-50 shadow-md" : ""}`}
    >
      <div className="mt-2 cursor-grab touch-none active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 space-y-2">{children}</div>
    </div>
  );
}
