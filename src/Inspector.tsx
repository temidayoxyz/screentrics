import { useRef, useState, type ReactNode } from "react";
import { WALLPAPER_COUNT } from "./render";
import { frameOf, type CaptureDoc, type CaptureStyle } from "./types";

const WALLPAPER_CLASS = ["wash-dawn", "wash-dusk", "wash-shore", "wash-tide"];

type InspectorProps = {
  doc: CaptureDoc;
  image: HTMLImageElement | null;
  onStyle: (style: Partial<CaptureStyle>) => void;
  onImage: (file: File) => void;
};

export default function Inspector({ doc, image, onStyle, onImage }: InspectorProps) {
  const style = doc.style;
  const frame = frameOf(style);
  return (
    <aside className="inspector">
      <Section title="Zoom">
        <ZoomPreview image={image} scale={frame.scale} x={frame.focusX} y={frame.focusY} onFocus={(focusX, focusY) => onStyle({ focusX, focusY })} />
        <Axis
          label="Scale"
          value={frame.scale}
          min={1}
          max={3}
          step={0.01}
          reset={1}
          format={(value) => `${value.toFixed(2)}x`}
          onChange={(scale) => onStyle({ scale })}
        />
      </Section>
      <Section title="Position">
        <PositionPad x={frame.focusX} y={frame.focusY} onChange={(focusX, focusY) => onStyle({ focusX, focusY })} />
        <Axis label="X" value={frame.focusX} min={-100} max={100} step={1} reset={0} onChange={(focusX) => onStyle({ focusX })} />
        <Axis label="Y" value={frame.focusY} min={-100} max={100} step={1} reset={0} onChange={(focusY) => onStyle({ focusY })} />
      </Section>
      <Section title="Rotation">
        <Axis label="X" value={frame.rotateX} min={-60} max={60} step={1} reset={0} onChange={(rotateX) => onStyle({ rotateX })} />
        <Axis label="Y" value={frame.rotateY} min={-60} max={60} step={1} reset={0} onChange={(rotateY) => onStyle({ rotateY })} />
        <Axis label="Z" value={frame.rotateZ} min={-60} max={60} step={1} reset={0} onChange={(rotateZ) => onStyle({ rotateZ })} />
      </Section>
      <Section title="Background">
        <Slider label="Padding" value={style.padding} min={0} max={160} onChange={(padding) => onStyle({ padding })} />
        <button className={style.backgroundMode === "color" ? "choice on" : "choice"} onClick={() => onStyle({ backgroundMode: "color" })}>
          Color
          <input
            aria-label="Background color"
            type="color"
            value={toHex(style.backgroundColor)}
            onChange={(event) => onStyle({ backgroundMode: "color", backgroundColor: event.target.value })}
          />
        </button>
        <button className={style.backgroundMode === "gradient" ? "choice on" : "choice"} onClick={() => onStyle({ backgroundMode: "gradient" })}>
          Gradient
        </button>
        <div className="wallpapers">
          <span>Wallpapers</span>
          <div>
            {Array.from({ length: WALLPAPER_COUNT }, (_, index) => (
              <button
                key={index}
                className={style.backgroundMode === "wallpaper" && style.wallpaper === index ? `swatch ${WALLPAPER_CLASS[index]} on` : `swatch ${WALLPAPER_CLASS[index]}`}
                aria-label={`Wallpaper ${index + 1}`}
                onClick={() => onStyle({ backgroundMode: "wallpaper", wallpaper: index })}
              />
            ))}
          </div>
        </div>
        <label className="choice">
          Image
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImage(file);
              event.target.value = "";
            }}
          />
        </label>
        <Slider label="Blur" value={style.blur} min={0} max={40} onChange={(blur) => onStyle({ blur })} />
        <Slider label="Noise" value={style.noise} min={0} max={100} onChange={(noise) => onStyle({ noise })} />
      </Section>
      <Section title="Border">
        <div className="border-styles">
          {[0, 1, 2, 3].map((index) => (
            <button
              key={index}
              className={style.borderStyle === index ? "border-style on" : "border-style"}
              aria-label={`Border style ${index + 1}`}
              onClick={() => onStyle({ borderStyle: index })}
            >
              <i className={`corner corner-${index}`} />
            </button>
          ))}
        </div>
        <Slider label="Radius" value={style.radius} min={0} max={80} onChange={(radius) => onStyle({ radius })} />
        <label className="hex">
          <input
            aria-label="Border color"
            type="color"
            value={toHex(style.borderColor)}
            onChange={(event) => onStyle({ borderColor: event.target.value })}
          />
          <span>{toHex(style.borderColor).toUpperCase()}</span>
        </label>
        <Slider label="Thickness" value={style.thickness} min={0} max={24} onChange={(thickness) => onStyle({ thickness })} />
      </Section>
      <Section title="Shadow">
        <Slider label="Blur" value={style.shadowBlur} min={0} max={80} onChange={(shadowBlur) => onStyle({ shadowBlur })} />
        <Slider label="Distance" value={style.shadowY} min={0} max={60} onChange={(shadowY) => onStyle({ shadowY })} />
        <Slider label="Opacity" value={style.shadowOpacity} min={0} max={80} onChange={(shadowOpacity) => onStyle({ shadowOpacity })} />
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={open ? "section open" : "section"}>
      <button className="section-title" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {title}
        <span>{open ? "⌃" : "⌄"}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return <Axis label={label} value={value} min={min} max={max} step={1} onChange={onChange} />;
}

function Axis({
  label,
  value,
  min,
  max,
  step,
  reset,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  reset?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
      {reset !== undefined && (
        <button
          type="button"
          className="reset"
          aria-label={`Reset ${label}`}
          onClick={(event) => {
            event.preventDefault();
            onChange(reset);
          }}
        >
          ×
        </button>
      )}
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{format ? format(value) : Math.round(value)}</em>
    </label>
  );
}

function ZoomPreview({
  image,
  scale,
  x,
  y,
  onFocus,
}: {
  image: HTMLImageElement | null;
  scale: number;
  x: number;
  y: number;
  onFocus: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function focusAt(event: React.PointerEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const nextX = Math.round((((event.clientX - rect.left) / rect.width) * 2 - 1) * 100);
    const nextY = Math.round((((event.clientY - rect.top) / rect.height) * 2 - 1) * 100);
    onFocus(clamp(nextX), clamp(nextY));
  }
  return (
    <div
      className="zoom-preview"
      ref={ref}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        focusAt(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) focusAt(event);
      }}
    >
      {image && (
        <img
          src={image.src}
          alt=""
          style={{ transform: `scale(${scale})`, transformOrigin: `${50 + x / 2}% ${50 + y / 2}%` }}
        />
      )}
      <i className="zoom-target" style={{ left: `${50 + x / 2}%`, top: `${50 + y / 2}%` }} />
    </div>
  );
}

function PositionPad({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  function place(event: React.PointerEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const nextX = Math.round((((event.clientX - rect.left) / rect.width) * 2 - 1) * 100);
    const nextY = Math.round((((event.clientY - rect.top) / rect.height) * 2 - 1) * 100);
    onChange(clamp(nextX), clamp(nextY));
  }
  return (
    <div
      className="pad"
      ref={ref}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        place(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) place(event);
      }}
    >
      <span className="pad-grid" />
      <i style={{ left: `${50 + x / 2}%`, top: `${50 + y / 2}%` }} />
    </div>
  );
}

function clamp(value: number) {
  return Math.min(100, Math.max(-100, value));
}

function toHex(color: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "#ffffff";
}
