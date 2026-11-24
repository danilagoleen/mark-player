import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// tb_1795483282_27036_4 (слово оператора 24.11): все loop-кнопки — ОДИН луп. Кнопка Repeat
// окна Playlist — второй вход в ту же функцию, что и меню Loop/Repeat главного окна:
// режим один (общее хранилище), смена едет событием в другое окно и приходит обратно.
// Сам транспорт (событие Tauri: имя, payload, отправка) покрыт repeatMode.test.ts; здесь
// контракт панели, мост подменён как в PlaylistPanel.inout.test.tsx.
const bridge = vi.hoisted(() => ({
  onChange: null as null | ((loop: "off" | "all" | "one") => void),
}));
vi.mock("../../lib/repeatMode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/repeatMode")>();
  return {
    ...actual,
    listenRepeatChanged: async (cb: (loop: "off" | "all" | "one") => void) => {
      bridge.onChange = cb;
      return () => {
        bridge.onChange = null;
      };
    },
  };
});

import { PlaylistPanel } from "./PlaylistPanel";
import { loadPlaybackMode, savePlaybackMode } from "../../lib/playlist";
import { cycleRepeatMode } from "../../lib/repeatMode";

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
  bridge.onChange = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlaylistPanel: Repeat ↔ главное окно (один луп)", () => {
  it("клик по Repeat переключает режим в общем хранилище: off → all → one → off", () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByTestId("playlist-loop");
    expect(btn.getAttribute("aria-label")).toBe("Repeat: off");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-label")).toBe("Repeat: all");
    expect(loadPlaybackMode().loop).toBe("all");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-label")).toBe("Repeat: one");
    expect(loadPlaybackMode().loop).toBe("one");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-label")).toBe("Repeat: off");
    expect(loadPlaybackMode().loop).toBe("off");
  });

  it("нажатие в главном окне (меню) меняет кнопку панели: событие приходит из другого окна", async () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    const btn = screen.getByTestId("playlist-loop");
    await waitFor(() => expect(bridge.onChange).not.toBeNull());
    // «меню» главного окна: та же функция, что у кнопки панели
    const next = cycleRepeatMode();
    bridge.onChange?.(next);
    await waitFor(() => expect(btn.getAttribute("aria-label")).toBe("Repeat: all"));
  });

  it("после нажатия в панели следующее нажатие в «меню» идёт от общего состояния, а не от копии", () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("playlist-loop")); // панель: off → all
    expect(cycleRepeatMode()).toBe("one"); // меню: all → one
    expect(loadPlaybackMode().loop).toBe("one");
  });

  it("Shuffle живёт рядом и не сбрасывается повтором", () => {
    savePlaybackMode({ shuffle: true, loop: "off" });
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("playlist-loop"));
    expect(loadPlaybackMode()).toEqual({ shuffle: true, loop: "all" });
  });

  it("Shuffle не затирает повтор, нажатый в главном окне, пока кнопка панели отстала", () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    // меню главного окна сменило повтор, событие до панели не дошло
    cycleRepeatMode();
    expect(loadPlaybackMode().loop).toBe("all");
    fireEvent.click(screen.getByTestId("playlist-shuffle"));
    expect(loadPlaybackMode()).toEqual({ shuffle: true, loop: "all" });
  });

  it("отписывается при размонтировании", async () => {
    const { unmount } = render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(bridge.onChange).not.toBeNull());
    unmount();
    await waitFor(() => expect(bridge.onChange).toBeNull());
  });
});
