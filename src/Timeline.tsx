import { useRef } from "react";
import type { CaptureDoc, ImageClip, TextClip, ZoomClip } from "./types";
import { formatTime, motionOf, uid } from "./types";
import { Icon } from "./theme";

type TimelineProps = {
  doc: CaptureDoc;
  playhead: number;
  playing: boolean;
  onPlayhead: (time: number) => void;
  onToggle: () => void;
  onChange: (motion: CaptureDoc["motion"]) => void;
};

export default function Timeline({ doc, playhead, playing, onPlayhead, onToggle, onChange }: TimelineProps) {
  const motion = motionOf(doc.motion);
  const laneRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

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

  function splitAtPlayhead() {
    onChange({
      ...motion,
      zooms: splitClips(motion.zooms, playhead),
      texts: splitClips(motion.texts, playhead),
      images: splitClips(motion.images, playhead),
    });
  }

  function addImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const start = Math.min(playhead, Math.max(0, motion.duration - 0.8));
      const clip: ImageClip = {
        id: uid(),
        start,
        end: Math.min(motion.duration, start + 1.6),
        src: String(reader.result),
      };
      onChange({ ...motion, images: [...motion.images, clip] });
    };
    reader.readAsDataURL(file);
  }

  function dragClip(kind: "zooms" | "texts" | "images", id: string, event: React.PointerEvent<HTMLButtonElement>) {
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
      images: motion.images.map((clip) => clampClip(clip, duration)),
    });
    if (playhead > duration) onPlayhead(duration);
  }

  const selectedText = motion.texts.find((clip) => playhead >= clip.start && playhead <= clip.end);

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <div className="timeline-tools">
          <button className="tool on" title="Select" aria-label="Select" aria-pressed="true">
            <Icon name="cursor" />
          </button>
          <button title="Split at playhead" aria-label="Split at playhead" onClick={splitAtPlayhead}>
            <Icon name="scissors" />
          </button>
          <span className="tool-gap" aria-hidden="true" />
          <button title="Add text" aria-label="Add text" onClick={addCaption}>
            <Icon name="type" />
          </button>
          <button title="Add image" aria-label="Add image" onClick={() => imageInput.current?.click()}>
            <Icon name="image" />
          </button>
          <button title="Add zoom" aria-label="Add zoom" onClick={addZoom}>
            <Icon name="zoom-in" />
          </button>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              addImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <div className="transport">
          <span>{formatTime(playhead)}</span>
          <button aria-label="Go to start" onClick={() => onPlayhead(0)}>
            <Icon name="skip-start-fill" />
          </button>
          <button className="play" aria-label={playing ? "Pause" : "Play"} onClick={onToggle}>
            <Icon name={playing ? "pause-fill" : "play-fill"} />
          </button>
          <button aria-label="Go to end" onClick={() => onPlayhead(motion.duration)}>
            <Icon name="skip-end-fill" />
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
          <em>Image</em>
          {motion.images.map((clip) => (
            <button
              key={clip.id}
              className="clip image"
              style={clipStyle(clip, motion.duration)}
              onPointerDown={(event) => dragClip("images", clip.id, event)}
            >
              Image
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

function splitClips<T extends { id: string; start: number; end: number }>(clips: T[], time: number) {
  const minSpan = 0.12;
  const next: T[] = [];
  for (const clip of clips) {
    if (time > clip.start + minSpan && time < clip.end - minSpan) {
      next.push({ ...clip, end: time }, { ...clip, id: uid(), start: time });
    } else {
      next.push(clip);
    }
  }
  return next;
}

function clipStyle(clip: { start: number; end: number }, duration: number) {
  return { left: `${(clip.start / duration) * 100}%`, width: `${((clip.end - clip.start) / duration) * 100}%` };
}

function clampClip<T extends { start: number; end: number }>(clip: T, duration: number): T {
  const span = Math.min(clip.end - clip.start, duration);
  const start = Math.max(0, Math.min(clip.start, duration - span));
  return { ...clip, start, end: start + span };
}
