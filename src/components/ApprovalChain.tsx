import type { ApprovalStageConfig } from "@/types/company-config";

interface Props {
  stages: ApprovalStageConfig[];
  // 申請人簽好的簽名(還沒簽就是 null)，讓這個預覽欄位跟實際會送出的資料一致，
  // 不是永遠顯示「簽名處」佔位文字。
  applicantSignature?: string | null;
}

export function ApprovalChain({ stages, applicantSignature }: Props) {
  // 申請人一定是第一格，後面幾格完全依 stages 陣列長度渲染 —— 2 關、3 關、5 關都不用改元件。
  const boxes = [{ id: "applicant", label: "申請人", signature: applicantSignature }, ...stages.map((s) => ({ id: s.id, label: s.label, signature: undefined as string | null | undefined }))];

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">簽核欄</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))` }}>
        {boxes.map((box) => (
          <div key={box.id} className="rounded border p-4 text-center">
            <div className="mb-2 font-medium">{box.label}</div>
            {box.signature ? (
              <img src={box.signature} alt={`${box.label}簽名`} className="mx-auto h-12 object-contain" />
            ) : (
              <div className="flex h-12 items-center justify-center text-sm text-muted-foreground">簽名處</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
