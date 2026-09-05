import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";

// 共用的可拖曳表格列：後台好幾個管理畫面(部門/費用項目/費用性質/簽核關卡)都是
// 「一張表、要能重新排序」的形狀，拖曳邏輯抽成這一個元件，各自的欄位內容當 children 傳進來。
export function SortableTableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 bg-slate-50 shadow-md" : undefined}
    >
      <TableCell className="w-8 cursor-grab touch-none active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      {children}
    </TableRow>
  );
}
