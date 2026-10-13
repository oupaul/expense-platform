import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const BUTTON_STEP = 1.4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_TOLERANCE = 6;

interface View {
  scale: number;
  x: number;
  y: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// 圖片檢視器：縮放(按鈕、Ctrl/⌘+滾輪、觸控板/手機雙指)、拖曳平移、雙擊/雙點放大，
// 加上左右旋轉。座標一律用「相對於容器中心」的位置計算，這樣縮放時才能固定住游標/
// 手指所在的那個點不跑掉。touch-action: none 是為了讓瀏覽器不要搶走雙指與拖曳手勢，
// 代價是手指放在圖片上無法捲動頁面——容器上下的工具列與空白處仍可正常捲動。
export function ImageViewer({ src, filename, onClose }: { src: string; filename: string; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const [rotation, setRotation] = useState(0);
  const [interacting, setInteracting] = useState(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { type: "pan"; startX: number; startY: number; base: View }
    | { type: "pinch"; d0: number; m0: { x: number; y: number }; base: View }
    | null
  >(null);
  const tap = useRef({ downAt: 0, moved: false, lastTapAt: 0, lastX: 0, lastY: 0 });

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const toLocal = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  };

  // 以 p 點為不動點，從 base 狀態縮放到 nextScale；縮回 1 倍就歸位，避免圖片停在偏掉的位置。
  const zoomAround = useCallback(
    (nextScale: number, p: { x: number; y: number }, base: View = viewRef.current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (scale <= MIN_SCALE) {
        setView({ scale: MIN_SCALE, x: 0, y: 0 });
        return;
      }
      const rect = containerRef.current!.getBoundingClientRect();
      const k = scale / base.scale;
      const limitX = (rect.width * scale) / 2;
      const limitY = (rect.height * scale) / 2;
      setView({
        scale,
        x: clamp(p.x - k * (p.x - base.x), -limitX, limitX),
        y: clamp(p.y - k * (p.y - base.y), -limitY, limitY),
      });
    },
    [setView]
  );

  // React 的 onWheel 是 passive listener，無法 preventDefault；要擋掉瀏覽器自己的頁面縮放
  // 必須手動掛 { passive: false }。只在按著 Ctrl/⌘ 時才縮放(觸控板雙指捏合在 Chrome 也會
  // 以 ctrlKey 的 wheel 事件送出)，平常的滾輪還是拿來捲動頁面，不會被圖片吃掉。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const p = { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) };
      zoomAround(viewRef.current.scale * Math.exp(-clamp(e.deltaY, -50, 50) * 0.005), p);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  const startPan = (clientX: number, clientY: number) => {
    gesture.current = { type: "pan", startX: clientX, startY: clientY, base: viewRef.current };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);
    if (pointers.current.size === 1) {
      startPan(e.clientX, e.clientY);
      tap.current.downAt = Date.now();
      tap.current.moved = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        m0: toLocal((a.x + b.x) / 2, (a.y + b.y) / 2),
        base: viewRef.current,
      };
      tap.current.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pan" && pointers.current.size === 1) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > TAP_MOVE_TOLERANCE) tap.current.moved = true;
      if (g.base.scale <= MIN_SCALE) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const limitX = (rect.width * g.base.scale) / 2;
      const limitY = (rect.height * g.base.scale) / 2;
      setView({
        scale: g.base.scale,
        x: clamp(g.base.x + dx, -limitX, limitX),
        y: clamp(g.base.y + dy, -limitY, limitY),
      });
    } else if (g.type === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      const scale = clamp(g.base.scale * (d / g.d0), MIN_SCALE, MAX_SCALE);
      if (scale <= MIN_SCALE) {
        setView({ scale: MIN_SCALE, x: 0, y: 0 });
        return;
      }
      const k = scale / g.base.scale;
      const rect = e.currentTarget.getBoundingClientRect();
      const limitX = (rect.width * scale) / 2;
      const limitY = (rect.height * scale) / 2;
      setView({
        scale,
        x: clamp(m.x - k * (g.m0.x - g.base.x), -limitX, limitX),
        y: clamp(m.y - k * (g.m0.y - g.base.y), -limitY, limitY),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const remaining = [...pointers.current.values()];

    if (remaining.length === 1) {
      // 雙指放開一指後，剩下那一指接著當作單指拖曳，從目前的位置繼續。
      startPan(remaining[0].x, remaining[0].y);
      return;
    }
    gesture.current = null;
    setInteracting(false);

    const now = Date.now();
    const t = tap.current;
    if (t.moved || now - t.downAt > DOUBLE_TAP_MS) return;
    const nearLastTap = Math.hypot(e.clientX - t.lastX, e.clientY - t.lastY) < 30;
    if (now - t.lastTapAt < DOUBLE_TAP_MS && nearLastTap) {
      t.lastTapAt = 0;
      const p = toLocal(e.clientX, e.clientY);
      if (viewRef.current.scale > MIN_SCALE) setView({ scale: MIN_SCALE, x: 0, y: 0 });
      else zoomAround(DOUBLE_TAP_SCALE, p);
    } else {
      t.lastTapAt = now;
      t.lastX = e.clientX;
      t.lastY = e.clientY;
    }
  };

  const buttonClass = "rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-40";
  const center = { x: 0, y: 0 };

  return (
    <div className="space-y-2 rounded border bg-slate-900 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-white">{filename}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            aria-label="縮小"
            disabled={view.scale <= MIN_SCALE}
            onClick={() => zoomAround(view.scale / BUTTON_STEP, center)}
          >
            －
          </button>
          <span className="w-10 text-center text-xs text-white">{Math.round(view.scale * 100)}%</span>
          <button
            type="button"
            className={buttonClass}
            aria-label="放大"
            disabled={view.scale >= MAX_SCALE}
            onClick={() => zoomAround(view.scale * BUTTON_STEP, center)}
          >
            ＋
          </button>
          <button type="button" className={buttonClass} onClick={() => setRotation((r) => r - 90)}>
            ↺ 向左旋轉
          </button>
          <button type="button" className={buttonClass} onClick={() => setRotation((r) => r + 90)}>
            ↻ 向右旋轉
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setView({ scale: 1, x: 0, y: 0 });
              setRotation(0);
            }}
          >
            還原
          </button>
          <button type="button" className={buttonClass} onClick={onClose}>
            收合
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`flex h-[60vh] items-center justify-center overflow-hidden rounded bg-black/40 ${
          view.scale > MIN_SCALE ? (interacting ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={filename}
          draggable={false}
          className={`max-h-full max-w-full select-none object-contain ${interacting ? "" : "transition-transform duration-150"}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${rotation}deg)` }}
        />
      </div>
      <p className="text-[11px] text-slate-400">
        縮放：＋／－按鈕、Ctrl(⌘)＋滾輪、雙指捏合，或雙擊；放大後可拖曳移動。
      </p>
    </div>
  );
}
