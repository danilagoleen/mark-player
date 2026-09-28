import { useEffect } from "react";
import { isTauriRuntimeSync } from "./nativeWindow";

interface DragDropCallbacks {
  onDrop: (paths: string[]) => void;
}

export function useDragDrop({ onDrop }: DragDropCallbacks) {
  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => {
      getCurrentWebviewWindow().onDragDropEvent((event) => {
        if (event.payload.type === "drop" && event.payload.paths) {
          onDrop(event.payload.paths);
        }
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, [onDrop]);
}
