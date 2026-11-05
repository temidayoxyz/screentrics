import { useEffect, useState } from "react";
import Inspector from "./Inspector";
import Stage from "./Stage";
import Timeline from "./Timeline";
import { captionAt, layoutOf, renderComposition, zoomAt } from "./render";
import type { Annotation, CaptureDoc, CaptureStyle, Tool } from "./types";
import { messageOf } from "./types";
import { invoke } from "@tauri-apps/api/core";
import WindowControls from "./chrome";

const COLORS = ["#1c1c1e", "#0a84ff", "#ff3b30", "#ff9f0a", "#34c759", "#ffffff"];
const TOOLS: { id: Tool; label: string; glyph: string }[] = [
  { id: "pointer", label: "Select", glyph: "↖" },
  { id: "rect", label: "Rectangle", glyph: "▢" },
  { id: "ellipse", label: "Ellipse", glyph: "◯" },
  { id: "line", label: "Line", glyph: "╱" },
  { id: "arrow", label: "Arrow", glyph: "↗" },
  { id: "text", label: "Text", glyph: "T" },
  { id: "pen", label: "Draw", glyph: "✎" },
];

type EditorProps = {
  doc: CaptureDoc;
  onChange: (doc: CaptureDoc) => void;
  onBack: () => void;
  onDelete: () => void;
  onNotice: (message: string) => void;
};

export default function Editor({ doc, onChange, onBack, onDelete, onNotice }: EditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<"static" | "motion">("static");
  const [tool, setTool] = useState<Tool>("pointer");
  const [color, setColor] = useState(COLORS[1]);
  const [stroke, setStroke] = useState(4);
  const [cropMode, setCropMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const history = useState<Annotation[][]>([])[0];

  useEffect(() => {
    let alive = true;
    setImage(null);
    invoke<string>("load_image", { id: doc.id })
      .then((url) => {
        const next = new Image();
        next.onload = () => {
          if (alive) setImage(next);
        };
        next.src = url;
      })
      .catch((error) => onNotice(messageOf(error)));
    return () => {
      alive = false;
    };
  }, [doc.id, onNotice]);

  useEffect(() => {
    if (!doc.style.backgroundImage) {
      setBackground(null);
      return;
    }
    const next = new Image();
    next.onload = () => setBackground(next);
    next.src = doc.style.backgroundImage;
  }, [doc.style.backgroundImage]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setPlayhead((value) => {
        const next = value + delta;
        if (next >= doc.motion.duration) {
          setPlaying(false);
          return doc.motion.duration;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, doc.motion.duration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.code === "Space" && mode === "motion") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        onChange({ ...doc, annotations: doc.annotations.filter((mark) => mark.id !== selectedId) });
        setSelectedId(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const previous = history.pop();
        if (previous) onChange({ ...doc, annotations: previous });
      }
      const shortcuts: Record<string, Tool> = {
        v: "pointer",
        r: "rect",
        o: "ellipse",
        l: "line",
        a: "arrow",
        t: "text",
        p: "pen",
      };
      const shortcut = shortcuts[event.key.toLowerCase()];
      if (shortcut && mode === "static" && !event.metaKey && !event.ctrlKey) setTool(shortcut);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, history, mode, onChange, selectedId]);

  function remember() {
    history.push(structuredClone(doc.annotations));
    if (history.length > 40) history.shift();
  }

  function setStyle(partial: Partial<CaptureStyle>) {
    onChange({ ...doc, style: { ...doc.style, ...partial } });
  }

  async function useBackgroundFile(file: File) {
    if (file.size > 4_000_000) {
      onNotice("Choose a background image under 4 MB.");
      return;
    }
    const url = await file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      bytes.forEach((value) => {
        binary += String.fromCharCode(value);
      });
      return `data:${file.type || "image/png"};base64,${btoa(binary)}`;
    });
    setStyle({ backgroundMode: "image", backgroundImage: url });
  }

  async function exportStill() {
    if (!image) return;
    setExporting(true);
    setMenu(false);
    try {
      const lay = layoutOf(doc);
      const canvas = document.createElement("canvas");
      canvas.width = lay.width;
      canvas.height = lay.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderComposition(ctx, image, image.naturalWidth, image.naturalHeight, doc, {
        zoom: mode === "motion" ? zoomAt(doc, playhead) : 1,
        caption: mode === "motion" ? captionAt(doc, playhead) : null,
        selectedId: null,
        showCrop: false,
        background,
      });
      const path = await invoke<string | null>("pick_save_path", {
        defaultName: fileName(doc.title, "png"),
        extension: "png",
      });
      if (!path) return;
      const data = canvas.toDataURL("image/png").split(",")[1];
      await invoke("write_export", { path, dataBase64: data });
      onNotice(`Saved ${path}`);
    } catch (error) {
      onNotice(messageOf(error));
    } finally {
      setExporting(false);
    }
  }

  async function exportMotion() {
    if (!image) return;
    setExporting(true);
    setMenu(false);
    setPlaying(false);
    try {
      const lay = layoutOf(doc);
      const scale = Math.min(1, 1600 / lay.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(lay.width * scale);
      canvas.height = Math.round(lay.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      const frames = Math.max(1, Math.round(doc.motion.duration * 30));
      for (let frame = 0; frame < frames; frame += 1) {
        const time = frame / 30;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        renderComposition(ctx, image, image.naturalWidth, image.naturalHeight, doc, {
          zoom: zoomAt(doc, time),
          caption: captionAt(doc, time),
          selectedId: null,
          showCrop: false,
          background,
        });
        await wait(1000 / 30);
      }
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: "video/webm" });
      const path = await invoke<string | null>("pick_save_path", {
        defaultName: fileName(doc.title, "webm"),
        extension: "webm",
      });
      if (!path) return;
      const data = await blobToBase64(blob);
      await invoke("write_export", { path, dataBase64: data });
      onNotice(`Saved ${path}`);
    } catch (error) {
      onNotice(messageOf(error));
    } finally {
      setExporting(false);
    }
  }

  const selected = doc.annotations.find((mark) => mark.id === selectedId) ?? null;
  const textMark = selected?.kind === "text" && editingText === selected.id ? selected : null;

  return (
    <div className={mode === "motion" ? "editor motion" : "editor"}>
      <header className="topbar" data-tauri-drag-region>
        <div className="title-group" data-tauri-drag-region>
          <button className="base" onClick={onBack}>
            Base
          </button>
          <span>/</span>
          <input
            className="title-input"
            aria-label="Capture title"
            value={doc.title}
            onChange={(event) => onChange({ ...doc, title: event.target.value })}
          />
          <button
            className={confirmDelete ? "trash armed" : "trash"}
            aria-label={confirmDelete ? "Confirm delete" : "Delete capture"}
            onClick={() => {
              if (confirmDelete) onDelete();
              else {
                setConfirmDelete(true);
                window.setTimeout(() => setConfirmDelete(false), 2500);
              }
            }}
          >
            {confirmDelete ? "Delete" : "Trash"}
          </button>
        </div>
        <div className="segment" role="tablist" aria-label="Editor mode">
          <button role="tab" aria-selected={mode === "static"} className={mode === "static" ? "on" : ""} onClick={() => { setMode("static"); setPlaying(false); }}>
            Static
          </button>
          <button role="tab" aria-selected={mode === "motion"} className={mode === "motion" ? "on" : ""} onClick={() => setMode("motion")}>
            Motion
          </button>
        </div>
        <div className="top-actions">
          <button className={cropMode ? "text-button on" : "text-button"} onClick={() => { setCropMode((value) => !value); setMode("static"); }}>
            Crop
          </button>
          <div className="export-wrap">
            <button className="text-button" disabled={exporting} onClick={() => setMenu((value) => !value)}>
              {exporting ? "Exporting" : "Export"}
              <span aria-hidden="true">▾</span>
            </button>
            {menu && (
              <div className="menu" role="menu">
                <button onClick={exportStill}>PNG image</button>
                <button onClick={exportMotion}>Motion video</button>
              </div>
            )}
          </div>
          <button className="done" onClick={onBack}>
            Done
          </button>
          <WindowControls />
        </div>
      </header>
      <Stage
        doc={doc}
        image={image}
        background={background}
        tool={tool}
        color={color}
        stroke={stroke}
        mode={mode}
        playhead={playhead}
        zoom={zoomAt(doc, playhead)}
        caption={captionAt(doc, playhead)}
        cropMode={cropMode}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChange={onChange}
        onEditText={setEditingText}
        onHistory={remember}
      />
      {textMark && (
        <input
          className="text-editor"
          value={textMark.text ?? ""}
          autoFocus
          aria-label="Annotation text"
          onChange={(event) =>
            onChange({
              ...doc,
              annotations: doc.annotations.map((mark) => (mark.id === textMark.id ? { ...mark, text: event.target.value } : mark)),
            })
          }
          onBlur={() => setEditingText(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") setEditingText(null);
          }}
        />
      )}
      <Inspector doc={doc} onStyle={setStyle} onImage={useBackgroundFile} />
      {mode === "static" ? (
        <div className="mark-bar">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              className={tool === item.id ? "tool on" : "tool"}
              aria-label={item.label}
              aria-pressed={tool === item.id}
              onClick={() => {
                setTool(item.id);
                setCropMode(false);
              }}
            >
              {item.glyph}
            </button>
          ))}
          <span className="swatch-gap" />
          {COLORS.map((swatch) => (
            <button
              key={swatch}
              className={color === swatch ? "color on" : "color"}
              style={{ background: swatch }}
              aria-label={swatch}
              onClick={() => {
                setColor(swatch);
                if (selectedId) {
                  onChange({
                    ...doc,
                    annotations: doc.annotations.map((mark) => (mark.id === selectedId ? { ...mark, color: swatch } : mark)),
                  });
                }
              }}
            />
          ))}
          <label className="weight">
            {selected?.kind === "text" ? "Size" : "Weight"}
            <input
              type="range"
              min={selected?.kind === "text" ? 16 : 2}
              max={selected?.kind === "text" ? 96 : 16}
              value={selected?.kind === "text" ? selected.size ?? 32 : stroke}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (selected?.kind === "text") {
                  onChange({
                    ...doc,
                    annotations: doc.annotations.map((mark) => (mark.id === selected.id ? { ...mark, size: value } : mark)),
                  });
                } else {
                  setStroke(value);
                  if (selected) {
                    onChange({
                      ...doc,
                      annotations: doc.annotations.map((mark) => (mark.id === selected.id ? { ...mark, stroke: value } : mark)),
                    });
                  }
                }
              }}
            />
          </label>
        </div>
      ) : (
        <Timeline
          doc={doc}
          playhead={playhead}
          playing={playing}
          onPlayhead={setPlayhead}
          onToggle={() => setPlaying((value) => !value)}
          onChange={(motion) => onChange({ ...doc, motion })}
        />
      )}
    </div>
  );
}

function fileName(title: string, extension: string) {
  const clean = title.replace(/[^\w\- ]+/g, "").trim() || "Screentrics";
  return `${clean}.${extension}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the video."));
    reader.readAsDataURL(blob);
  });
}
