import { frameOf, type Annotation, type CaptureDoc, type Crop } from "./types";

export type Layout = {
  width: number;
  height: number;
  room: number;
  card: { x: number; y: number; w: number; h: number };
  image: { x: number; y: number; w: number; h: number };
  radii: [number, number, number, number];
  outerRadius: number;
};

export const WALLPAPER_COUNT = 4;

function clampRadius(value: number, width: number, height: number) {
  return Math.max(0, Math.min(value, Math.min(width, height) / 2));
}

function cornerRadii(style: number, radius: number, width: number, height: number): [number, number, number, number] {
  const round = clampRadius(radius, width, height);
  const sharp = Math.min(2, round);
  if (style === 1) return [round, round, sharp, sharp];
  if (style === 2) return [sharp, sharp, sharp, sharp];
  if (style === 3) return Array(4).fill(clampRadius(radius * 1.8, width, height)) as [number, number, number, number];
  return [round, round, round, round];
}

export function layoutOf(doc: CaptureDoc): Layout {
  const cropW = Math.max(2, doc.width * doc.crop.w);
  const cropH = Math.max(2, doc.height * doc.crop.h);
  const pad = doc.style.padding;
  const frame = frameOf(doc.style);
  const tilt = Math.abs(frame.rotateX) + Math.abs(frame.rotateY) + Math.abs(frame.rotateZ);
  const room = Math.ceil(doc.style.shadowBlur + Math.abs(doc.style.shadowY) + 24 + tilt * 2.4);
  const card = { x: room, y: room, w: cropW + pad * 2, h: cropH + pad * 2 };
  const radii = cornerRadii(doc.style.borderStyle, doc.style.radius, cropW, cropH);
  return {
    width: Math.round(card.w + room * 2),
    height: Math.round(card.h + room * 2),
    room,
    card,
    image: { x: room + pad, y: room + pad, w: cropW, h: cropH },
    radii,
    outerRadius: pad > 8 ? Math.max(22, radii[0]) : radii[0],
  };
}

export function zoomAt(doc: CaptureDoc, time: number) {
  const clip = doc.motion.zooms.find((item) => time >= item.start && time <= item.end);
  if (!clip) return 1;
  const span = Math.max(0.05, clip.end - clip.start);
  const t = Math.min(1, Math.max(0, (time - clip.start) / span));
  const edge = 0.22;
  let amount = 1;
  if (t < edge) amount = t / edge;
  else if (t > 1 - edge) amount = (1 - t) / edge;
  const eased = amount * amount * (3 - 2 * amount);
  return 1 + (clip.scale - 1) * eased;
}

export function captionAt(doc: CaptureDoc, time: number) {
  return doc.motion.texts.find((item) => time >= item.start && time <= item.end)?.text ?? null;
}

export function overlayAt(doc: CaptureDoc, time: number) {
  return doc.motion.images?.find((item) => time >= item.start && time <= item.end)?.src ?? null;
}

function traceRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | [number, number, number, number],
) {
  const [tl, tr, br, bl] = (typeof radii === "number" ? [radii, radii, radii, radii] : radii).map((radius) =>
    clampRadius(radius, w, h),
  );
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

function paintWallpaper(ctx: CanvasRenderingContext2D, index: number, w: number, h: number) {
  const choice = ((index % WALLPAPER_COUNT) + WALLPAPER_COUNT) % WALLPAPER_COUNT;
  if (choice === 0) {
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, "#ffb03a");
    wash.addColorStop(0.34, "#ff7a3c");
    wash.addColorStop(0.58, "#49c8ff");
    wash.addColorStop(1, "#2d62ff");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  } else if (choice === 1) {
    const wash = ctx.createLinearGradient(0, h, w, 0);
    wash.addColorStop(0, "#24124a");
    wash.addColorStop(0.45, "#6d5cff");
    wash.addColorStop(1, "#c7b6ff");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  } else if (choice === 2) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#ffb15a");
    sky.addColorStop(0.42, "#ff8d6a");
    sky.addColorStop(0.43, "#243246");
    sky.addColorStop(1, "#101820");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  } else {
    const wash = ctx.createLinearGradient(0, h, w, 0);
    wash.addColorStop(0, "#08384a");
    wash.addColorStop(0.5, "#1aa58d");
    wash.addColorStop(1, "#b7fff2");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
  }
  const glow = ctx.createRadialGradient(w * 0.18, h * 0.22, 8, w * 0.2, h * 0.25, w * 0.55);
  glow.addColorStop(0, "rgba(255,255,255,0.28)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

let noiseTile: HTMLCanvasElement | null = null;
function noiseSource() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement("canvas");
  noiseTile.width = 140;
  noiseTile.height = 140;
  const context = noiseTile.getContext("2d");
  if (!context) return noiseTile;
  const pixels = context.createImageData(140, 140);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = Math.random() * 255;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return noiseTile;
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  doc: CaptureDoc,
  card: Layout["card"],
  background?: CanvasImageSource | null,
) {
  const { style } = doc;
  ctx.save();
  traceRound(ctx, card.x, card.y, card.w, card.h, style.padding > 8 ? Math.max(22, style.radius) : style.radius);
  ctx.clip();
  if (style.blur > 0) ctx.filter = `blur(${style.blur}px)`;
  if (style.backgroundMode === "image" && background) {
    ctx.drawImage(background, card.x - 20, card.y - 20, card.w + 40, card.h + 40);
  } else if (style.backgroundMode === "color") {
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(card.x - 20, card.y - 20, card.w + 40, card.h + 40);
  } else if (style.backgroundMode === "gradient") {
    const gradient = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y + card.h);
    gradient.addColorStop(0, style.backgroundColor);
    gradient.addColorStop(1, "#1c1c1e");
    ctx.fillStyle = gradient;
    ctx.fillRect(card.x, card.y, card.w, card.h);
  } else {
    ctx.save();
    ctx.translate(card.x - 20, card.y - 20);
    paintWallpaper(ctx, style.wallpaper, card.w + 40, card.h + 40);
    ctx.restore();
  }
  ctx.filter = "none";
  if (style.noise > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, style.noise / 180);
    const tile = noiseSource();
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(card.x, card.y, card.w, card.h);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stroke: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, stroke * 3.2);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  doc: CaptureDoc,
  image: Layout["image"],
  selectedId: string | null,
) {
    const mapX = (value: number) => image.x + ((value - doc.crop.x) / doc.crop.w) * image.w;
    const mapY = (value: number) => image.y + ((value - doc.crop.y) / doc.crop.h) * image.h;
    for (const mark of doc.annotations) {
    ctx.save();
    ctx.lineWidth = mark.stroke;
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if ((mark.kind === "rect" || mark.kind === "ellipse") && mark.w != null && mark.h != null) {
      const x = mapX(mark.x);
      const y = mapY(mark.y);
      const w = (mark.w / doc.crop.w) * image.w;
      const h = (mark.h / doc.crop.h) * image.h;
      if (mark.kind === "rect") {
        ctx.strokeRect(x, y, w, h);
      } else {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if ((mark.kind === "line" || mark.kind === "arrow") && mark.x2 != null && mark.y2 != null) {
      const x1 = mapX(mark.x);
      const y1 = mapY(mark.y);
      const x2 = mapX(mark.x2);
      const y2 = mapY(mark.y2);
      if (mark.kind === "line") {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else {
        drawArrow(ctx, x1, y1, x2, y2, mark.stroke);
      }
    } else if (mark.kind === "pen" && mark.points && mark.points.length > 1) {
      ctx.beginPath();
      mark.points.forEach((point, index) => {
        const x = mapX(point.x);
        const y = mapY(point.y);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (mark.kind === "text") {
      const size = mark.size ?? 32;
      ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(mark.text || "Text", mapX(mark.x), mapY(mark.y));
    }
    if (mark.id === selectedId) {
      const bounds = markBounds(mark, image, doc.crop);
      if (bounds) {
        ctx.strokeStyle = "#0a84ff";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
      }
    }
    ctx.restore();
  }
}

function markBounds(mark: Annotation, image: Layout["image"], crop: Crop) {
  const mapX = (value: number) => image.x + ((value - crop.x) / crop.w) * image.w;
  const mapY = (value: number) => image.y + ((value - crop.y) / crop.h) * image.h;
  if ((mark.kind === "rect" || mark.kind === "ellipse") && mark.w != null && mark.h != null) {
    const x = mapX(mark.x);
    const y = mapY(mark.y);
    const w = (mark.w / crop.w) * image.w;
    const h = (mark.h / crop.h) * image.h;
    return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
  }
  if ((mark.kind === "line" || mark.kind === "arrow") && mark.x2 != null && mark.y2 != null) {
    const x1 = mapX(mark.x);
    const y1 = mapY(mark.y);
    const x2 = mapX(mark.x2);
    const y2 = mapY(mark.y2);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  if (mark.kind === "pen" && mark.points?.length) {
    const xs = mark.points.map((point) => mapX(point.x));
    const ys = mark.points.map((point) => mapY(point.y));
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (mark.kind === "text") {
    const size = mark.size ?? 32;
    const width = Math.max(24, (mark.text || "Text").length * size * 0.56);
    return { x: mapX(mark.x), y: mapY(mark.y) - size, w: width, h: size * 1.2 };
  }
  return null;
}

export function renderComposition(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  doc: CaptureDoc,
  options: {
    zoom: number;
    caption: string | null;
    overlay?: HTMLImageElement | null;
    selectedId: string | null;
    showCrop: boolean;
    background?: CanvasImageSource | null;
  },
) {
  const lay = layoutOf(doc);
  ctx.clearRect(0, 0, lay.width, lay.height);
  const buffer = cardBuffer(lay.card.w, lay.card.h);
  buffer.ctx.save();
  buffer.ctx.translate(-lay.card.x, -lay.card.y);
  paintCard(buffer.ctx, source, sourceWidth, sourceHeight, doc, lay, options);
  buffer.ctx.restore();
  drawProjectedCard(ctx, buffer.canvas, lay, doc);
  return lay;
}

function paintCard(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  doc: CaptureDoc,
  lay: Layout,
  options: {
    zoom: number;
    caption: string | null;
    overlay?: HTMLImageElement | null;
    selectedId: string | null;
    showCrop: boolean;
    background?: CanvasImageSource | null;
  },
) {
  paintBackground(ctx, doc, lay.card, options.background);
  const { image } = lay;
  const frame = frameOf(doc.style);
  ctx.save();
  traceRound(ctx, image.x, image.y, image.w, image.h, lay.radii);
  ctx.clip();
  const ax = image.x + image.w * (0.5 + frame.focusX / 220);
  const ay = image.y + image.h * (0.5 + frame.focusY / 220);
  const contentScale = frame.scale * options.zoom;
  ctx.translate(ax, ay);
  ctx.scale(contentScale, contentScale);
  ctx.translate(-ax, -ay);
  const sx = doc.crop.x * sourceWidth;
  const sy = doc.crop.y * sourceHeight;
  const sw = Math.max(1, doc.crop.w * sourceWidth);
  const sh = Math.max(1, doc.crop.h * sourceHeight);
  ctx.drawImage(source, sx, sy, sw, sh, image.x, image.y, image.w, image.h);
  drawAnnotations(ctx, doc, image, options.selectedId);
  ctx.restore();

  if (doc.style.thickness > 0) {
    ctx.save();
    ctx.strokeStyle = doc.style.borderColor;
    ctx.lineWidth = doc.style.thickness;
    traceRound(ctx, image.x, image.y, image.w, image.h, lay.radii);
    ctx.stroke();
    ctx.restore();
  }

  if (options.overlay) drawOverlay(ctx, options.overlay, image);

  if (options.caption) {
    ctx.save();
    ctx.font = `600 28px "Segoe UI", system-ui, sans-serif`;
    const text = options.caption;
    const width = ctx.measureText(text).width;
    const pillW = width + 28;
    const pillH = 40;
    const x = lay.card.x + (lay.card.w - pillW) / 2;
    const y = lay.card.y + lay.card.h - pillH - 22;
    traceRound(ctx, x, y, pillW, pillH, 20);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fill();
    ctx.fillStyle = "#1c1c1e";
    ctx.fillText(text, x + 14, y + 27);
    ctx.restore();
  }

  if (options.showCrop) {
    ctx.save();
    ctx.strokeStyle = "#0a84ff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(image.x, image.y, image.w, image.h);
    ctx.fillStyle = "#fff";
    for (const point of cropHandles(image)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement,
  image: { x: number; y: number; w: number; h: number },
) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) return;
  const maxW = image.w * 0.28;
  const maxH = image.h * 0.34;
  const fit = Math.min(maxW / width, maxH / height);
  const w = width * fit;
  const h = height * fit;
  const x = image.x + image.w - w - image.w * 0.04;
  const y = image.y + image.h - h - image.h * 0.06;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  traceRound(ctx, x, y, w, h, 12);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.clip();
  ctx.drawImage(source, x, y, w, h);
  ctx.restore();
}

type Point = { x: number; y: number };

let cardCanvas: HTMLCanvasElement | null = null;

function cardBuffer(width: number, height: number) {
  if (!cardCanvas) cardCanvas = document.createElement("canvas");
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  if (cardCanvas.width !== safeW || cardCanvas.height !== safeH) {
    cardCanvas.width = safeW;
    cardCanvas.height = safeH;
  }
  const ctx = cardCanvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the capture.");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, safeW, safeH);
  return { canvas: cardCanvas, ctx };
}

function projectCard(x: number, y: number, w: number, h: number, rx: number, ry: number, rz: number): Point[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const perspective = Math.max(w, h) * 2.4;
  const ax = (rx * Math.PI) / 180;
  const ay = (ry * Math.PI) / 180;
  const az = (rz * Math.PI) / 180;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([px, py]) => {
    const x1 = px * Math.cos(az) - py * Math.sin(az);
    const y1 = px * Math.sin(az) + py * Math.cos(az);
    const y2 = y1 * Math.cos(ax);
    const z2 = y1 * Math.sin(ax);
    const x3 = z2 * Math.sin(ay) + x1 * Math.cos(ay);
    const z3 = z2 * Math.cos(ay) - x1 * Math.sin(ay);
    const depth = perspective / Math.max(80, perspective + z3);
    return { x: cx + x3 * depth, y: cy + y2 * depth };
  });
}

function drawProjectedCard(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, lay: Layout, doc: CaptureDoc) {
  const frame = frameOf(doc.style);
  const quad = projectCard(lay.card.x, lay.card.y, lay.card.w, lay.card.h, frame.rotateX, frame.rotateY, frame.rotateZ);
  const [tl, tr, br, bl] = quad;
  ctx.save();
  ctx.filter = doc.style.shadowBlur > 0 ? `blur(${doc.style.shadowBlur}px)` : "none";
  ctx.fillStyle = `rgba(28, 32, 40, ${doc.style.shadowOpacity / 100})`;
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y + doc.style.shadowY);
  ctx.lineTo(tr.x, tr.y + doc.style.shadowY);
  ctx.lineTo(br.x, br.y + doc.style.shadowY);
  ctx.lineTo(bl.x, bl.y + doc.style.shadowY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const flat = Math.abs(frame.rotateX) + Math.abs(frame.rotateY) + Math.abs(frame.rotateZ) < 0.4;
  if (flat) {
    ctx.drawImage(source, lay.card.x, lay.card.y);
    return;
  }
  const strips = 56;
  for (let index = 0; index < strips; index += 1) {
    const start = index / strips;
    const end = (index + 1) / strips;
    const topLeft = mix(tl, bl, start);
    const topRight = mix(tr, br, start);
    const bottomLeft = mix(tl, bl, end);
    const sy = start * source.height;
    const sh = Math.max(1, (end - start) * source.height);
    ctx.save();
    ctx.transform(
      (topRight.x - topLeft.x) / source.width,
      (topRight.y - topLeft.y) / source.width,
      (bottomLeft.x - topLeft.x) / sh,
      (bottomLeft.y - topLeft.y) / sh,
      topLeft.x,
      topLeft.y,
    );
    ctx.drawImage(source, 0, sy, source.width, Math.ceil(sh) + 1, 0, 0, source.width, sh);
    ctx.restore();
  }
}

function mix(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function flattenPoint(doc: CaptureDoc, x: number, y: number) {
  const frame = frameOf(doc.style);
  if (Math.abs(frame.rotateX) + Math.abs(frame.rotateY) + Math.abs(frame.rotateZ) < 0.4) return { x, y };
  const lay = layoutOf(doc);
  const [tl, tr, br, bl] = projectCard(lay.card.x, lay.card.y, lay.card.w, lay.card.h, frame.rotateX, frame.rotateY, frame.rotateZ);
  let u = 0.5;
  let v = 0.5;
  for (let step = 0; step < 10; step += 1) {
    const top = mix(tl, tr, u);
    const bottom = mix(bl, br, u);
    const point = mix(top, bottom, v);
    const du = mix({ x: tr.x - tl.x, y: tr.y - tl.y }, { x: br.x - bl.x, y: br.y - bl.y }, v);
    const dv = { x: bottom.x - top.x, y: bottom.y - top.y };
    const det = du.x * dv.y - du.y * dv.x;
    if (Math.abs(det) < 0.0001) break;
    const dx = x - point.x;
    const dy = y - point.y;
    u = Math.min(1, Math.max(0, u + (dx * dv.y - dy * dv.x) / det));
    v = Math.min(1, Math.max(0, v + (du.x * dy - du.y * dx) / det));
  }
  return { x: lay.card.x + u * lay.card.w, y: lay.card.y + v * lay.card.h };
}

export type CropEdge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | "move";

function cropHandles(image: Layout["image"]) {
  const { x, y, w, h } = image;
  return [
    { edge: "nw" as const, x, y },
    { edge: "n" as const, x: x + w / 2, y },
    { edge: "ne" as const, x: x + w, y },
    { edge: "e" as const, x: x + w, y: y + h / 2 },
    { edge: "se" as const, x: x + w, y: y + h },
    { edge: "s" as const, x: x + w / 2, y: y + h },
    { edge: "sw" as const, x, y: y + h },
    { edge: "w" as const, x, y: y + h / 2 },
  ];
}

export function hitCropHandle(doc: CaptureDoc, px: number, py: number): CropEdge | null {
  const image = layoutOf(doc).image;
  let closest: { edge: CropEdge; distance: number } | null = null;
  for (const handle of cropHandles(image)) {
    const distance = Math.hypot(px - handle.x, py - handle.y);
    if (distance < 18 && (!closest || distance < closest.distance)) closest = { edge: handle.edge, distance };
  }
  if (closest) return closest.edge;
  if (px >= image.x && px <= image.x + image.w && py >= image.y && py <= image.y + image.h) return "move";
  return null;
}

export function resizeCrop(origin: Crop, edge: CropEdge, dnx: number, dny: number): Crop {
  const min = 0.04;
  let { x, y, w, h } = origin;
  const applyX = edge.includes("w") || edge === "move";
  const applyY = edge.includes("n") || edge === "move";
  const applyR = edge.includes("e");
  const applyB = edge.includes("s");
  if (edge === "move") {
    x = Math.min(1 - w, Math.max(0, x + dnx));
    y = Math.min(1 - h, Math.max(0, y + dny));
    return { x, y, w, h };
  }
  if (applyX) {
    const next = x + dnx;
    const right = x + w;
    x = Math.max(0, Math.min(next, right - min));
    w = right - x;
  }
  if (applyR) w = Math.max(min, Math.min(1 - x, w + dnx));
  if (applyY) {
    const next = y + dny;
    const bottom = y + h;
    y = Math.max(0, Math.min(next, bottom - min));
    h = bottom - y;
  }
  if (applyB) h = Math.max(min, Math.min(1 - y, h + dny));
  return { x, y, w, h };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function pointInImage(doc: CaptureDoc, px: number, py: number) {
  const image = layoutOf(doc).image;
  if (px < image.x || py < image.y || px > image.x + image.w || py > image.y + image.h) return null;
  return {
    x: doc.crop.x + ((px - image.x) / image.w) * doc.crop.w,
    y: doc.crop.y + ((py - image.y) / image.h) * doc.crop.h,
  };
}

export function hitTest(doc: CaptureDoc, px: number, py: number) {
  const image = layoutOf(doc).image;
  const local = pointInImage(doc, px, py);
  if (!local) return null;
  for (let index = doc.annotations.length - 1; index >= 0; index -= 1) {
    const mark = doc.annotations[index];
    if ((mark.kind === "rect" || mark.kind === "ellipse") && mark.w != null && mark.h != null) {
      const x = Math.min(mark.x, mark.x + mark.w);
      const y = Math.min(mark.y, mark.y + mark.h);
      const w = Math.abs(mark.w);
      const h = Math.abs(mark.h);
      if (local.x >= x && local.x <= x + w && local.y >= y && local.y <= y + h) return mark.id;
    } else if ((mark.kind === "line" || mark.kind === "arrow") && mark.x2 != null && mark.y2 != null) {
      if (distanceToSegment(local.x, local.y, mark.x, mark.y, mark.x2, mark.y2) < 0.02) return mark.id;
    } else if (mark.kind === "pen" && mark.points) {
      if (mark.points.some((point) => Math.hypot(point.x - local.x, point.y - local.y) < 0.02)) return mark.id;
    } else if (mark.kind === "text") {
      const bounds = markBounds(mark, image, doc.crop);
      if (bounds && px >= bounds.x && px <= bounds.x + bounds.w && py >= bounds.y && py <= bounds.y + bounds.h) {
        return mark.id;
      }
    }
  }
  return null;
}
