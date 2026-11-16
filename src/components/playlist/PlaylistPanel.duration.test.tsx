import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PlaylistPanel } from "./PlaylistPanel";

// tb_1794846994_51008_1 (скрин 2 оператора): запись плейлиста агента без поля
// duration показывала «NaN:NaN» в каждой строке. Нет времени — нет строки.
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
  const ls = createLocalStorageMock();
  vi.stubGlobal("localStorage", ls);
  ls.setItem(
    "vetka_player_lab_playlist_v1",
    JSON.stringify({
      id: "gold",
      name: "gold",
      createdAt: "2026-11-16T00:00:00Z",
      entries: [
        { path: "/v/a.mov", name: "02 A — наезд", addedAt: "2026-11-16T00:00:00Z", question_id: "q-a", question: "Отметьте…" },
        { path: "/v/b.mov", name: "03 B", addedAt: "2026-11-16T00:00:00Z", duration: 97 },
      ],
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlaylistPanel: время записи", () => {
  it("запись без duration не показывает NaN:NaN", () => {
    const { container } = render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    expect(container.textContent).not.toContain("NaN");
  });
  it("запись с duration показывает минуты:секунды как раньше", () => {
    const { container } = render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    expect(container.textContent).toContain("1:37");
  });
});
