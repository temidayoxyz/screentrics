import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./theme";

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
        <Icon name="dash" />
      </button>
      <button aria-label="Maximize" onClick={() => void appWindow.toggleMaximize()}>
        <Icon name="square" />
      </button>
      <button className="close" aria-label="Close" onClick={() => void appWindow.close()}>
        <Icon name="x-lg" />
      </button>
    </div>
  );
}
