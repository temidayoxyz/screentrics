import { getCurrentWindow } from "@tauri-apps/api/window";

export default function WindowControls() {
  let appWindow: ReturnType<typeof getCurrentWindow> | null = null;
  try {
    appWindow = getCurrentWindow();
  } catch {
    return null;
  }
  return (
    <div className="window-controls">
      <button aria-label="Minimize" onClick={() => void appWindow.minimize()}>
        –
      </button>
      <button aria-label="Maximize" onClick={() => void appWindow.toggleMaximize()}>
        □
      </button>
      <button className="close" aria-label="Close" onClick={() => void appWindow.close()}>
        ×
      </button>
    </div>
  );
}
