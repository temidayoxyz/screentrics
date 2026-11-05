import { useRef } from "react";
import type { CaptureDoc, TextClip, ZoomClip } from "./types";
import { formatTime, uid } from "./types";

type TimelineProps = {
  doc: CaptureDoc;
  playhead: number;
  playing: boolean;
  onPlayhead: (time: number) => void;
  onToggle: () => void;
  onChange: (motion: CaptureDoc["motion"]) => void;
};

export default function Timeline({ doc, playhead, playing, onPlayhead, onToggle, onChange }: TimelineProps) {
  const motion = doc.motion;
  const laneRef = useRef<HTMLDivElement>(null);

  function timeAt(clientX: number) {
    const lane = laneRef.current;
    if (!lane) return 0;
    const rect = lane.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * motion.duration;
  }

  function seek(event: React.PointerEvent<HTMLDivElement>) {
    onPlayhead(timeAt(event.clientX));
  }

  function addZoom() {
    const start = Math.min(playhead, Math.max(0, motion.duration - 0.8));
    const clip: ZoomClip = { id: uid(), start, end: Math.min(motion.duration, start + 1.2), scale: 1.6 };
    onChange({ ...motion, zooms: [...motion.zooms, clip] });
  }

  function addCaption() {
    const start = Math.min(playhead, Math.max(0, motion.duration - 0.8));
    const clip: TextClip = {
      id: uid(),
      start,
      end: Math.min(motion.duration, start + 1.6),
      text: "Caption",
    };
    onChange({ ...motion, texts: [...motion.texts, clip] });
  }

  function dragClip(kind: "zooms" | "texts", id: string, event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const startX = event.clientX;
    const lane = laneRef.current;
    if (!lane) return;
    const width = lane.getBoundingClientRect().width;
    const original = motion[kind].find((clip) => clip.id === id);
    if (!original) return;
    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - startX) / width) * motion.duration;
      const span = original.end - original.start;
      let start = original.start + delta;
      start = Math.max(0, Math.min(motion.duration - span, start));
      const next = motion[kind].map((clip) => (clip.id === id ? { ...clip, start, end: start + span } : clip));
      onChange({ ...motion, [kind]: next });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function setDuration(duration: number) {
    onChange({
      duration,
      zooms: motion.zooms.map((clip) => clampClip(clip, duration)),
      texts: motion.texts.map((clip) => clampClip(clip, duration)),
    });
    if (playhead > duration) onPlayhead(duration);
  }

  const selectedText = motion.texts.find((clip) => playhead >= clip.start && playhead <= clip.end);

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <div className="timeline-tools">
          <button className="tool on" title="Playhead" aria-label="Playhead">
            <PointerIcon />
          </button>
          <button title="Add zoom" aria-label="Add zoom" onClick={addZoom}>
            <ZoomIcon />
          </button>
          <button title="Add caption" aria-label="Add caption" onClick={addCaption}>
            Aa
          </button>
        </div>
        <div className="transport">
          <span>{formatTime(playhead)}</span>
          <button aria-label="Go to start" onClick={() => onPlayhead(0)}>
            ‹
          </button>
          <button className="play" aria-label={playing ? "Pause" : "Play"} onClick={onToggle}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button aria-label="Go to end" onClick={() => onPlayhead(motion.duration)}>
            ›
          </button>
          <span>{formatTime(motion.duration)}</span>
        </div>
        <label className="duration">
          <select value={motion.duration} aria-label="Duration" onChange={(event) => setDuration(Number(event.target.value))}>
            {[3, 5, 8, 12].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}s
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="lanes" ref={laneRef} onPointerDown={seek}>
        <div className="ruler">
          {Array.from({ length: motion.duration + 1 }, (_, second) => (
            <span key={second} style={{ left: `${(second / motion.duration) * 100}%` }}>
              {formatTime(second)}
            </span>
          ))}
        </div>
        <div className="lane">
          <em>Text</em>
          {motion.texts.map((clip) => (
            <button
              key={clip.id}
              className="clip text"
              style={clipStyle(clip, motion.duration)}
              onPointerDown={(event) => dragClip("texts", clip.id, event)}
            >
              {clip.text}
            </button>
          ))}
        </div>
        <div className="lane">
          <em>Zoom</em>
          {motion.zooms.map((clip) => (
            <button
              key={clip.id}
              className="clip zoom"
              style={clipStyle(clip, motion.duration)}
              onPointerDown={(event) => dragClip("zooms", clip.id, event)}
            >
              {clip.scale.toFixed(1)}×
            </button>
          ))}
        </div>
        <div className="lane film">
          <i style={{ width: `${(playhead / motion.duration) * 100}%` }} />
          <i />
          <b>
            {motion.duration.toFixed(1)}s <span>1×</span>
          </b>
        </div>
        <div className="playhead" style={{ left: `${(playhead / motion.duration) * 100}%` }} />
      </div>
      {selectedText && (
        <label className="caption-edit">
          Caption
          <input
            value={selectedText.text}
            onChange={(event) =>
              onChange({
                ...motion,
                texts: motion.texts.map((clip) => (clip.id === selectedText.id ? { ...clip, text: event.target.value } : clip)),
              })
            }
          />
        </label>
      )}
    </div>
  );
}

function clipStyle(clip: { start: number; end: number }, duration: number) {
  return { left: `${(clip.start / duration) * 100}%`, width: `${((clip.end - clip.start) / duration) * 100}%` };
}

function clampClip<T extends { start: number; end: number }>(clip: T, duration: number): T {
  const span = Math.min(clip.end - clip.start, duration);
  const start = Math.max(0, Math.min(clip.start, duration - span));
  return { ...clip, start, end: start + span };
}

function PointerIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 2.2 12.2 8.1 7.4 8.8 5.6 13.2Z" fill="currentColor" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
