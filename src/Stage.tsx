import { useEffect, useRef } from "react";
import {
  hitCropHandle,
  hitTest,
  layoutOf,
  pointInImage,
  renderComposition,
  resizeCrop,
  type CropEdge,
} from "./render";
import type { Annotation, CaptureDoc, Tool } from "./types";
import { uid } from "./types";

type Drag =
  | { kind: "new"; id: string; startX: number; startY: number }
  | { kind: "move"; id: string; origin: Annotation; lastX: number; lastY: number }
  | {
      kind: "crop";
      edge: CropEdge;
      origin: CaptureDoc["crop"];
      startClientX: number;
      startClientY: number;
      scale: number;
    };

type StageProps = {
  doc: CaptureDoc;
  image: HTMLImageElement | null;
  background: HTMLImageElement | null;
  tool: Tool;
  color: string;
  stroke: number;
  mode: "static" | "motion";
  playhead: number;
  zoom: number;
  caption: string | null;
  cropMode: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (doc: CaptureDoc) => void;
  onEditText: (id: string) => void;
  onHistory: () => void;
};

export default function Stage({
  doc,
  image,
  background,
  tool,
  color,
  stroke,
  mode,
  playhead,
  zoom,
  caption,
  cropMode,
  selectedId,
  onSelect,
  onChange,
  onEditText,
  onHistory,
}: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  const dragRef = useRef<Drag | null>(null);
  docRef.current = doc;

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !image) return;
    const draw = () => {
      const current = docRef.current;
      const lay = layoutOf(current);
      const bounds = frame.getBoundingClientRect();
      const fit = Math.min((bounds.width - 48) / lay.width, (bounds.height - 48) / lay.height, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.max(1, lay.width * fit);
      const cssH = Math.max(1, lay.height * fit);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(fit * dpr, 0, 0, fit * dpr, 0, 0);
      renderComposition(ctx, image, image.naturalWidth, image.naturalHeight, current, {
        zoom: mode === "motion" ? zoom : 1,
        caption: mode === "motion" ? caption : null,
        selectedId: mode === "static" ? selectedId : null,
        showCrop: cropMode && mode === "static",
        background,
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [image, background, doc, mode, zoom, caption, cropMode, selectedId, playhead]);

  function compositionPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const lay = layoutOf(docRef.current);
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * lay.width,
      y: ((event.clientY - rect.top) / rect.height) * lay.height,
    };
  }

  function updateAnnotation(id: string, recipe: (mark: Annotation) => Annotation) {
    const current = docRef.current;
    onChange({
      ...current,
      annotations: current.annotations.map((mark) => (mark.id === id ? recipe(mark) : mark)),
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!image || event.button !== 0 || mode === "motion") return;
    const point = compositionPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = docRef.current;
    if (cropMode) {
      const edge = hitCropHandle(current, point.x, point.y);
      if (!edge) return;
      onHistory();
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = rect.width / layoutOf(current).width;
      dragRef.current = {
        kind: "crop",
        edge,
        origin: { ...current.crop },
        startClientX: event.clientX,
        startClientY: event.clientY,
        scale: scale || 1,
      };
      return;
    }
    if (tool === "pointer") {
      const id = hitTest(current, point.x, point.y);
      onSelect(id);
      if (!id) return;
      const origin = current.annotations.find((mark) => mark.id === id);
      if (!origin) return;
      onHistory();
      dragRef.current = { kind: "move", id, origin: structuredClone(origin), lastX: point.x, lastY: point.y };
      if (origin.kind === "text") onEditText(id);
      return;
    }
    const local = pointInImage(current, point.x, point.y);
    if (!local) return;
    onHistory();
    const id = uid();
    const mark: Annotation = {
      id,
      kind: tool,
      color,
      stroke,
      x: local.x,
      y: local.y,
      size: Math.max(28, stroke * 8),
      text: tool === "text" ? "Text" : undefined,
      w: tool === "rect" || tool === "ellipse" ? 0 : undefined,
      h: tool === "rect" || tool === "ellipse" ? 0 : undefined,
      x2: tool === "line" || tool === "arrow" ? local.x : undefined,
      y2: tool === "line" || tool === "arrow" ? local.y : undefined,
      points: tool === "pen" ? [local] : undefined,
    };
    onChange({ ...current, annotations: [...current.annotations, mark] });
    onSelect(id);
    if (tool === "text") {
      onEditText(id);
      dragRef.current = null;
      return;
    }
    dragRef.current = { kind: "new", id, startX: local.x, startY: local.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = compositionPoint(event);
    if (!point) return;
    const current = docRef.current;
    if (drag.kind === "crop") {
      const dnx = (event.clientX - drag.startClientX) / drag.scale / current.width;
      const dny = (event.clientY - drag.startClientY) / drag.scale / current.height;
      onChange({ ...current, crop: resizeCrop(drag.origin, drag.edge, dnx, dny) });
      return;
    }
    const local = pointInImage(current, point.x, point.y);
    if (drag.kind === "new") {
      if (!local) return;
      const square = event.shiftKey;
      updateAnnotation(drag.id, (mark) => {
        if (mark.kind === "rect" || mark.kind === "ellipse") {
          let w = local.x - drag.startX;
          let h = local.y - drag.startY;
          if (square) {
            const size = Math.max(Math.abs(w), Math.abs(h));
            w = Math.sign(w || 1) * size;
            h = Math.sign(h || 1) * size;
          }
          return { ...mark, w, h };
        }
        if (mark.kind === "line" || mark.kind === "arrow") return { ...mark, x2: local.x, y2: local.y };
        if (mark.kind === "pen") return { ...mark, points: [...(mark.points ?? []), local] };
        return mark;
      });
      return;
    }
    const image = layoutOf(current).image;
    const dnx = ((point.x - drag.lastX) / image.w) * current.crop.w;
    const dny = ((point.y - drag.lastY) / image.h) * current.crop.h;
    drag.lastX = point.x;
    drag.lastY = point.y;
    updateAnnotation(drag.id, (mark) => moveMark(mark, dnx, dny));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.kind !== "new") return;
    const current = docRef.current;
    onChange({
      ...current,
      annotations: current.annotations.filter((mark) => {
        if (mark.id !== drag.id) return true;
        if ((mark.kind === "rect" || mark.kind === "ellipse") && Math.abs(mark.w ?? 0) < 0.004) return false;
        return true;
      }).map((mark) => normalizeMark(mark)),
    });
  }

  return (
    <div className="stage" ref={frameRef}>
      {image ? (
        <canvas
          ref={canvasRef}
          className={cropMode ? "cropping" : tool}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ) : (
        <p className="stage-wait">Opening capture…</p>
      )}
    </div>
  );
}

function moveMark(mark: Annotation, dx: number, dy: number): Annotation {
  const next = { ...mark, x: mark.x + dx, y: mark.y + dy };
  if (next.x2 != null) next.x2 += dx;
  if (next.y2 != null) next.y2 += dy;
  if (next.points) next.points = next.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  return next;
}

function normalizeMark(mark: Annotation): Annotation {
  if ((mark.kind === "rect" || mark.kind === "ellipse") && mark.w != null && mark.h != null) {
    let { x, y, w, h } = mark;
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    return { ...mark, x, y, w, h };
  }
  return mark;
}
