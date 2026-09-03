import type { ApprovalStageConfig } from "@/types/company-config";

export function ApprovalChain({ stages }: { stages: ApprovalStageConfig[] }) {
  // 申請人一定是第一格，後面幾格完全依 stages 陣列長度渲染 —— 2 關、3 關、5 關都不用改元件。
  const boxes = [{ id: "applicant", label: "申請人" }, ...stages.map((s) => ({ id: s.id, label: s.label }))];

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">簽核欄</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))` }}>
        {boxes.map((box) => (
          <div key={box.id} className="rounded border p-4 text-center">
            <div className="mb-8 font-medium">{box.label}</div>
            <div className="text-sm text-muted-foreground">簽名處</div>
          </div>
        ))}
      </div>
    </div>
  );
}
