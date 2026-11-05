import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "./Editor";
import Library, { useCaptureEvents } from "./Library";
import RegionOverlay from "./RegionOverlay";
import { createDoc, isDoc, messageOf, type Captured, type CaptureDoc } from "./types";

type LibraryPayload = { captures: unknown[]; thumbs: { id: string; thumb: string }[] };

export default function App() {
  if (new URLSearchParams(window.location.search).get("view") === "overlay") return <RegionOverlay />;
  return <Studio />;
}

function Studio() {
  const [docs, setDocs] = useState<CaptureDoc[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<LibraryPayload>("load_library")
      .then((payload) => {
        const loaded = payload.captures.filter(isDoc).sort((a, b) => b.createdAt - a.createdAt);
        setDocs(loaded);
        setThumbs(Object.fromEntries(payload.thumbs.map((thumb) => [thumb.id, thumb.thumb])));
        setReady(true);
      })
      .catch((error) => setNotice(messageOf(error)));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      invoke("save_library", { captures: docs }).catch((error) => setNotice(messageOf(error)));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [docs, ready]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onCapture = useCallback((captured: Captured, title: string) => {
    const doc = createDoc(captured, title);
    setDocs((current) => [doc, ...current.filter((item) => item.id !== doc.id)]);
    setThumbs((current) => ({ ...current, [captured.id]: captured.thumb }));
    setActiveId(doc.id);
    setNotice("");
  }, []);

  const onError = useCallback((message: string) => {
    if (message) setNotice(message);
  }, []);

  useCaptureEvents(onCapture, onError);

  const active = docs.find((doc) => doc.id === activeId) ?? null;

  function remove(id: string) {
    setDocs((current) => current.filter((doc) => doc.id !== id));
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="studio">
      {active ? (
        <Editor
          doc={active}
          onChange={(next) => setDocs((current) => current.map((doc) => (doc.id === next.id ? next : doc)))}
          onBack={() => setActiveId(null)}
          onDelete={() => remove(active.id)}
          onNotice={setNotice}
        />
      ) : (
        <Library
          docs={docs}
          thumbs={thumbs}
          busy={busy}
          onOpen={setActiveId}
          onCapture={onCapture}
          onDelete={remove}
          onError={onError}
          onBusy={setBusy}
        />
      )}
      {notice && <div className="notice">{notice}</div>}
    </div>
  );
}
