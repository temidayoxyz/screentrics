import { useState, type ReactNode } from "react";
import { WALLPAPER_COUNT } from "./render";
import type { CaptureDoc, CaptureStyle } from "./types";

const WALLPAPER_CLASS = ["wash-dawn", "wash-dusk", "wash-shore", "wash-tide"];

type InspectorProps = {
  doc: CaptureDoc;
  onStyle: (style: Partial<CaptureStyle>) => void;
  onImage: (file: File) => void;
};

export default function Inspector({ doc, onStyle, onImage }: InspectorProps) {
  const style = doc.style;
  return (
    <aside className="inspector">
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
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{value}</em>
    </label>
  );
}

function toHex(color: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "#ffffff";
}
