import { isTauriRuntimeSync } from "./nativeWindow";

export interface PanelEventMap {
  "panel:chat-send": { text: string };
  "panel:contact-select": { modelId: string; modelName: string };
  "panel:open-phonebook": {};
  "panel:open-chat-history": {};
  "panel:close": {};
  "player:marker-added": { kind: string; markerId: string; text: string };
}

export type PanelEventName = keyof PanelEventMap;
export type PanelEventPayload<N extends PanelEventName> = PanelEventMap[N];

type Listener<N extends PanelEventName> = (payload: PanelEventPayload<N>) => void;

const listeners = new Map<PanelEventName, Set<Listener<any>>>();

export function onPanelEvent<N extends PanelEventName>(
  event: N,
  listener: Listener<N>,
): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(listener);
  return () => listeners.get(event)?.delete(listener);
}

export function emitPanelEvent<N extends PanelEventName>(
  event: N,
  payload: PanelEventPayload<N>,
): void {
  const set = listeners.get(event);
  if (set) set.forEach((fn) => fn(payload));
}

async function setupTauriBridge() {
  if (!isTauriRuntimeSync()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    for (const eventName of listeners.keys()) {
      await listen(eventName, (event) => {
        const payload = event.payload as any;
        emitPanelEvent(eventName as PanelEventName, payload);
      });
    }
  } catch {
    // Tauri event system unavailable
  }
}

if (typeof window !== "undefined") {
  setupTauriBridge();
}
