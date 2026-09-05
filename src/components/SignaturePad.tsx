import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 150;

// 電子簽名輸入：手寫(畫布)跟上傳檔案共用同一個元件，統一輸出成 base64 data URL。
// 畫布用 Pointer Events 而不是分開處理滑鼠/觸控事件 —— 筆電觸控板、滑鼠、手機/平板
// 觸控螢幕在瀏覽器裡都會正規化成同一套 pointer 事件，不用另外寫三套邏輯。
export function SignaturePad({ value, onChange, label }: Props) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const getContext = () => canvasRef.current?.getContext("2d") ?? null;

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  // 放開手指/滑鼠只代表這一筆畫結束，簽名通常要畫很多筆(不同筆畫、簽好幾個字)，
  // 不能一放開就當作簽名完成送出——要等使用者確認畫完、按下「完成簽名」才真的定案。
  const finishStroke = () => {
    drawingRef.current = false;
  };

  const confirmSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  const handleFile = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("請上傳圖片檔(PNG/JPG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFileError("檔案過大，請上傳 2MB 以內的圖片");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.onerror = () => setFileError("讀取檔案失敗，請再試一次");
    reader.readAsDataURL(file);
  };

  // 已經有簽名(不管是剛畫的還是上傳的)：顯示預覽 + 重新簽名
  if (value) {
    return (
      <div className="space-y-2">
        {label && <p className="text-sm font-medium">{label}</p>}
        <div className="inline-block rounded border bg-white p-2">
          <img src={value} alt="簽名預覽" className="h-[80px] object-contain" />
        </div>
        <div>
          <Button type="button" size="sm" variant="outline" onClick={clearCanvas}>
            重新簽名
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("draw")}
          className={`rounded px-3 py-1 text-xs font-medium ${mode === "draw" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          手寫簽名
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded px-3 py-1 text-xs font-medium ${mode === "upload" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          上傳簽名檔
        </button>
      </div>

      {mode === "draw" ? (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="touch-none rounded border border-dashed border-slate-300 bg-white"
            style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, cursor: "crosshair" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerLeave={finishStroke}
          />
          <p className="text-xs text-muted-foreground">
            滑鼠、觸控板拖曳，或手機/平板直接用手指簽名，可以分好幾筆畫，簽好再按「完成簽名」。
          </p>
          {hasDrawn && (
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={confirmSignature}>
                完成簽名
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clearCanvas}>
                清除重簽
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block text-sm"
          />
          {fileError && <p className="text-xs text-destructive">{fileError}</p>}
        </div>
      )}
    </div>
  );
}
