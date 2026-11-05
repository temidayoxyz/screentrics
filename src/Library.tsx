import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Captured, MonitorInfo, WindowInfo } from "./types";
import { messageOf } from "./types";
import WindowControls from "./chrome";

type LibraryProps = {
  docs: { id: string; title: string; createdAt: number }[];
  thumbs: Record<string, string>;
  busy: boolean;
  onOpen: (id: string) => void;
  onCapture: (captured: Captured, title: string) => void;
  onDelete: (id: string) => void;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
};

export default function Library({ docs, thumbs, busy, onOpen, onCapture, onDelete, onError, onBusy }: LibraryProps) {
  const [picker, setPicker] = useState<"screen" | "window" | null>(null);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);

  async function loadSources() {
    const sources = await invoke<{ monitors: MonitorInfo[]; windows: WindowInfo[] }>("list_sources");
    setMonitors(sources.monitors);
    setWindows(sources.windows);
    return sources;
  }

  async function captureScreen() {
    onError("");
    try {
      const sources = await loadSources();
      if (sources.monitors.length <= 1) {
        const monitor = sources.monitors[0];
        if (!monitor) throw new Error("No screen was found.");
        await grabMonitor(monitor.index, monitor.name);
      } else {
        setPicker("screen");
      }
    } catch (error) {
      onError(messageOf(error));
    }
  }

  async function grabMonitor(index: number, title: string) {
    setPicker(null);
    onBusy(true);
    const window = getCurrentWindow();
    try {
      await window.hide();
      await wait(160);
      const captured = await invoke<Captured>("capture_monitor", { index });
      onCapture(captured, title || "Screen");
    } catch (error) {
      onError(messageOf(error));
    } finally {
      await window.show();
      await window.setFocus();
      onBusy(false);
    }
  }

  async function openWindows() {
    onError("");
    try {
      await loadSources();
      setPicker("window");
    } catch (error) {
      onError(messageOf(error));
    }
  }

  async function grabWindow(item: WindowInfo) {
    setPicker(null);
    onBusy(true);
    try {
      const captured = await invoke<Captured>("capture_window", { id: item.id });
      onCapture(captured, item.title || item.app || "Window");
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function grabArea() {
    onError("");
    onBusy(true);
    try {
      const bounds = await invoke<{ x: number; y: number; width: number; height: number }>("primary_bounds");
      const overlay = await WebviewWindow.getByLabel("overlay");
      if (!overlay) throw new Error("The capture overlay is not available.");
      await overlay.setPosition(new PhysicalPosition(bounds.x, bounds.y));
      await overlay.setSize(new PhysicalSize(bounds.width, bounds.height));
      await getCurrentWindow().hide();
      await overlay.show();
      await overlay.setFocus();
    } catch (error) {
      onError(messageOf(error));
      await getCurrentWindow().show();
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="library">
      <div className="library-head">
        <div data-tauri-drag-region>
          <h1>Screentrics</h1>
          <p>Capture, edit, and keep it.</p>
        </div>
        <div className="capture-actions">
          <button onClick={grabArea} disabled={busy}>Area</button>
          <button onClick={openWindows} disabled={busy}>Window</button>
          <button className="primary" onClick={captureScreen} disabled={busy}>Screen</button>
          <WindowControls />
        </div>
      </div>
      {docs.length === 0 ? (
        <div className="empty">
          <strong>No captures yet</strong>
          <p>Take an area, a window, or a whole screen. It stays on this computer.</p>
        </div>
      ) : (
        <div className="grid">
          {docs.map((doc) => (
            <article key={doc.id} className="card">
              <button className="card-open" onClick={() => onOpen(doc.id)}>
                {thumbs[doc.id] ? <img src={thumbs[doc.id]} alt="" /> : <span className="thumb-missing" />}
                <span>
                  <strong>{doc.title}</strong>
                  <em>{new Date(doc.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</em>
                </span>
              </button>
              <button className="card-delete" aria-label={`Delete ${doc.title}`} onClick={() => onDelete(doc.id)}>
                Trash
              </button>
            </article>
          ))}
        </div>
      )}
      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(null)}>
          <div className="sheet" role="dialog" aria-label={picker === "screen" ? "Choose a screen" : "Choose a window"} onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{picker === "screen" ? "Choose a screen" : "Choose a window"}</strong>
              <button onClick={() => setPicker(null)}>Close</button>
            </header>
            <div className="sheet-list">
              {picker === "screen"
                ? monitors.map((monitor) => (
                    <button key={monitor.index} onClick={() => grabMonitor(monitor.index, monitor.name)}>
                      <strong>{monitor.name}</strong>
                      <em>
                        {monitor.width} × {monitor.height}
                        {monitor.primary ? " · Primary" : ""}
                      </em>
                    </button>
                  ))
                : windows.map((item) => (
                    <button key={item.id} onClick={() => grabWindow(item)}>
                      <strong>{item.title}</strong>
                      <em>{item.app}</em>
                    </button>
                  ))}
              {picker === "window" && windows.length === 0 && <p>No open windows to capture.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useCaptureEvents(onCapture: (captured: Captured, title: string) => void, onError: (message: string) => void) {
  useEffect(() => {
    let alive = true;
    const stops: Array<() => void> = [];
    void import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const captured = await listen<Captured>("region-captured", (event) => onCapture(event.payload, "Area capture"));
        const failed = await listen<{ message: string }>("region-failed", (event) => onError(event.payload.message));
        if (!alive) {
          captured();
          failed();
          return;
        }
        stops.push(captured, failed);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stops.forEach((stop) => stop());
    };
  }, [onCapture, onError]);
}
