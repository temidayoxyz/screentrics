import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Captured } from "./types";
import { messageOf } from "./types";

type Box = { x: number; y: number; w: number; h: number };

export default function RegionOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const boxRef = useRef<Box | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  function updateBox(next: Box | null) {
    boxRef.current = next;
    setBox(next);
  }

  useEffect(() => {
    rootRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") void cancel();
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    origin.current = { x: event.clientX, y: event.clientY };
    updateBox({ x: event.clientX, y: event.clientY, w: 0, h: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!origin.current) return;
    const x = Math.min(origin.current.x, event.clientX);
    const y = Math.min(origin.current.y, event.clientY);
    updateBox({ x, y, w: Math.abs(event.clientX - origin.current.x), h: Math.abs(event.clientY - origin.current.y) });
  }

  async function onPointerUp() {
    const current = boxRef.current;
    origin.current = null;
    const root = rootRef.current?.getBoundingClientRect();
    if (!current || !root || current.w < 8 || current.h < 8) {
      updateBox(null);
      return;
    }
    const nx = (current.x - root.left) / root.width;
    const ny = (current.y - root.top) / root.height;
    const nw = current.w / root.width;
    const nh = current.h / root.height;
    updateBox(null);
    await getCurrentWindow().hide();
    await wait(160);
    try {
      const captured = await invoke<Captured>("capture_region", { nx, ny, nw, nh });
      await emit("region-captured", captured);
    } catch (error) {
      await emit("region-failed", { message: messageOf(error) });
    } finally {
      await showMain();
    }
  }

  return (
    <div
      className="overlay"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => void onPointerUp()}
    >
      <p>Drag to capture an area. Esc cancels.</p>
      {box && box.w > 0 && (
        <div className="selection" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
          <span>
            {Math.round(box.w)} × {Math.round(box.h)}
          </span>
        </div>
      )}
    </div>
  );

  async function cancel() {
    origin.current = null;
    updateBox(null);
    await getCurrentWindow().hide();
    await showMain();
  }
}

async function showMain() {
  const main = await WebviewWindow.getByLabel("main");
  await main?.show();
  await main?.unminimize();
  await main?.setFocus();
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
