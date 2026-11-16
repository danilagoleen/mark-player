import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// tb_1794846994_51008_1 Б: тумблер ножниц окна плейлиста обязан сообщить главному
// окну (storage между вебвью Tauri не ходит) и слышать главное окно обратно.
// Сам транспорт (событие Tauri) покрыт inOutPlayBridge.test.ts — здесь контракт панели.
const bridge = vi.hoisted(() => ({
  notify: vi.fn(async (_enabled: boolean) => "tauri" as const),
  onChange: null as null | ((enabled: boolean) => void),
}));
vi.mock("../../lib/inOutPlayBridge", () => ({
  notifyInOutPlayChanged: bridge.notify,
  listenInOutPlayChanged: async (cb: (enabled: boolean) => void) => {
    bridge.onChange = cb;
    return () => {
      bridge.onChange = null;
    };
  },
}));

import { PlaylistPanel } from "./PlaylistPanel";

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  bridge.notify.mockClear();
  bridge.onChange = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlaylistPanel: ножницы ↔ главное окно", () => {
  it("клик по ножницам сообщает мосту новое значение", async () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("playlist-inout-play"));
    await waitFor(() => expect(bridge.notify).toHaveBeenCalledWith(false));
    fireEvent.click(screen.getByTestId("playlist-inout-play"));
    await waitFor(() => expect(bridge.notify).toHaveBeenLastCalledWith(true));
  });

  it("событие из главного окна (S) переключает ножницы панели", async () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByTestId("playlist-inout-play");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(bridge.onChange).not.toBeNull());
    bridge.onChange?.(false);
    await waitFor(() => expect(btn.getAttribute("aria-pressed")).toBe("false"));
  });

  it("отписывается при размонтировании", async () => {
    const { unmount } = render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(bridge.onChange).not.toBeNull());
    unmount();
    await waitFor(() => expect(bridge.onChange).toBeNull());
  });
});
