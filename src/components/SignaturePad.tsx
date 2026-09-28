import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthState } from "@/types/auth";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  auth: AuthState;
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 150;

// 電子簽名輸入：手寫(畫布)跟上傳檔案共用同一個元件，統一輸出成 base64 data URL。
// 畫布用 Pointer Events 而不是分開處理滑鼠/觸控事件 —— 筆電觸控板、滑鼠、手機/平板
// 觸控螢幕在瀏覽器裡都會正規化成同一套 pointer 事件，不用另外寫三套邏輯。
export function SignaturePad({ value, onChange, label, auth }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);

  // 使用者自己存的「預設簽名」，存在帳號底下(不是存在某一張申請單/簽核紀錄上)——
  // 每個用到 SignaturePad 的地方(申請單、簽核)都可能是同一個使用者，共用同一份，
  // 用同一個 queryKey 讓其中一處存了新的預設簽名後，另一處也會跟著更新。
  const savedQueryKey = ["me", "signature"];
  const { data: savedData } = useQuery({
    queryKey: savedQueryKey,
    queryFn: () => apiFetch<{ signature: string | null }>("/auth/me/signature", { token: auth.token }),
  });
  const savedSignature = savedData?.signature ?? null;

  const saveMutation = useMutation({
    mutationFn: (signature: string) => apiFetch("/auth/me/signature", { method: "PUT", token: auth.token, body: { signature } }),
    onSuccess: () => {
      setSavedError(null);
      queryClient.invalidateQueries({ queryKey: savedQueryKey });
    },
    onError: (err) => setSavedError(err instanceof ApiError ? err.message : "儲存失敗"),
  });

  const forgetMutation = useMutation({
    mutationFn: () => apiFetch("/auth/me/signature", { method: "DELETE", token: auth.token }),
    onSuccess: () => {
      setSavedError(null);
      queryClient.invalidateQueries({ queryKey: savedQueryKey });
    },
    onError: (err) => setSavedError(err instanceof ApiError ? err.message : "移除失敗"),
  });

  // value 被外部清成 null(例如表單送出後重置、或退回重新送出成功後回到全新的建立模式)時，
  // 畫布會換成一塊全新空白的，但 hasDrawn 是元件自己的 state，不會跟著自動歸零，
  // 沒有這行的話畫面會留著上一次簽名的「完成簽名/清除重簽」按鈕，卻對應一塊空白畫布。
  useEffect(() => {
    if (!value) setHasDrawn(false);
  }, [value]);

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

  // 已經有簽名(不管是剛畫的、上傳的，還是套用已儲存的簽名)：顯示預覽 + 重新簽名。
  // 「設為預設簽名」只在目前這個簽名還沒被存成預設值時才顯示，避免每次都跳出來、
  // 誤以為不點一下就沒存到——已經存過的話點了也只是存一模一樣的內容，沒有意義。
  if (value) {
    return (
      <div className="space-y-2">
        {label && <p className="text-sm font-medium">{label}</p>}
        <div className="inline-block rounded border bg-white p-2">
          <img src={value} alt="簽名預覽" className="h-[80px] object-contain" />
        </div>
        {savedError && <p className="text-xs text-destructive">{savedError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={clearCanvas}>
            重新簽名
          </Button>
          {value !== savedSignature && (
            <Button type="button" size="sm" variant="outline" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(value)}>
              {saveMutation.isPending ? "儲存中…" : "設為預設簽名"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      {/* 使用者帳號底下存過預設簽名的話，優先讓他們一鍵套用，不用每次都重新畫/重新上傳——
          仍然要自己點一下「使用這個簽名」才會套用到這一次的申請單/簽核，不是自動帶入，
          保留「這是我對這次內容的簽署動作」的意思。 */}
      {savedSignature && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-dashed bg-slate-50 p-3">
          <img src={savedSignature} alt="已儲存的簽名預覽" className="h-[50px] object-contain" />
          <Button type="button" size="sm" onClick={() => onChange(savedSignature)}>
            使用這個簽名
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={forgetMutation.isPending}
            onClick={() => forgetMutation.mutate()}
          >
            {forgetMutation.isPending ? "移除中…" : "不再顯示"}
          </Button>
        </div>
      )}
      {savedError && <p className="text-xs text-destructive">{savedError}</p>}
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
