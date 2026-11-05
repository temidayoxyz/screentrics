export type Tool = "pointer" | "rect" | "ellipse" | "line" | "arrow" | "text" | "pen";

export type Annotation = {
  id: string;
  kind: "rect" | "ellipse" | "line" | "arrow" | "pen" | "text";
  color: string;
  stroke: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[];
  text?: string;
  size?: number;
};

export type CaptureStyle = {
  padding: number;
  backgroundMode: "wallpaper" | "color" | "gradient" | "image";
  wallpaper: number;
  backgroundColor: string;
  backgroundImage: string | null;
  blur: number;
  noise: number;
  borderStyle: number;
  radius: number;
  borderColor: string;
  thickness: number;
  shadowBlur: number;
  shadowY: number;
  shadowOpacity: number;
  scale: number;
  focusX: number;
  focusY: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
};

export type ZoomClip = { id: string; start: number; end: number; scale: number };
export type TextClip = { id: string; start: number; end: number; text: string };
export type ImageClip = { id: string; start: number; end: number; src: string };

export type Motion = {
  duration: number;
  zooms: ZoomClip[];
  texts: TextClip[];
  images: ImageClip[];
};

export type Crop = { x: number; y: number; w: number; h: number };

export type CaptureDoc = {
  id: string;
  title: string;
  createdAt: number;
  width: number;
  height: number;
  style: CaptureStyle;
  annotations: Annotation[];
  crop: Crop;
  motion: Motion;
};

export type Captured = { id: string; width: number; height: number; thumb: string };

export type MonitorInfo = {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  primary: boolean;
};

export type WindowInfo = { id: string; title: string; app: string; width: number; height: number };

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultStyle(): CaptureStyle {
  return {
    padding: 64,
    backgroundMode: "wallpaper",
    wallpaper: 0,
    backgroundColor: "#ffffff",
    backgroundImage: null,
    blur: 0,
    noise: 0,
    borderStyle: 0,
    radius: 14,
    borderColor: "#ffffff",
    thickness: 0,
    shadowBlur: 36,
    shadowY: 18,
    shadowOpacity: 22,
    scale: 1,
    focusX: 0,
    focusY: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
  };
}

export function frameOf(style: Partial<CaptureStyle>) {
  const base = defaultStyle();
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value ?? fallback));
  return {
    scale: clamp(style.scale, base.scale, 1, 3),
    focusX: clamp(style.focusX, 0, -100, 100),
    focusY: clamp(style.focusY, 0, -100, 100),
    rotateX: clamp(style.rotateX, 0, -60, 60),
    rotateY: clamp(style.rotateY, 0, -60, 60),
    rotateZ: clamp(style.rotateZ, 0, -60, 60),
  };
}

export function createDoc(captured: Captured, title: string): CaptureDoc {
  return {
    id: captured.id,
    title,
    createdAt: Date.now(),
    width: captured.width,
    height: captured.height,
    style: defaultStyle(),
    annotations: [],
    crop: { x: 0, y: 0, w: 1, h: 1 },
    motion: { duration: 5, zooms: [], texts: [], images: [] },
  };
}

export function isDoc(value: unknown): value is CaptureDoc {
  if (!value || typeof value !== "object") return false;
  const doc = value as CaptureDoc;
  return (
    typeof doc.id === "string" &&
    typeof doc.title === "string" &&
    typeof doc.width === "number" &&
    !!doc.style &&
    !!doc.crop &&
    !!doc.motion
  );
}

export function motionOf(motion: Partial<Motion> | undefined): Motion {
  return {
    duration: motion?.duration ?? 5,
    zooms: motion?.zooms ?? [],
    texts: motion?.texts ?? [],
    images: motion?.images ?? [],
  };
}

export function formatTime(seconds: number) {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const whole = Math.floor(clamped % 60);
  const tenth = Math.floor((clamped % 1) * 10);
  return `${minutes}:${whole.toString().padStart(2, "0")}.${tenth}`;
}

export function messageOf(error: unknown) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Something went wrong.";
  if (message.includes("invoke") || message.includes("transformCallback")) {
    return "Capture runs in the Screentrics desktop window. Use the app that opens with npm run tauri dev.";
  }
  return message;
}
