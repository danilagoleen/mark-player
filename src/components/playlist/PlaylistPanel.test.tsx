import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PlaylistPanel } from "./PlaylistPanel";

function setPlaylistEntries(count: number) {
  const entries = Array.from({ length: count }, (_, i) => ({
    path: `/video${i}.mp4`,
    name: `Video ${i}`,
    duration: 120 + i * 10,
    addedAt: new Date().toISOString(),
  }));
  const playlist = {
    id: "test",
    name: "Test Playlist",
    entries,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(playlist));
}

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

describe("PlaylistPanel", () => {
  beforeEach(() => {
    // vitest 4 + jsdom 28 не даёт localStorage — стаб на каждый тест [signal: env fix] [project: cut-player]
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders empty state", () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();
    render(<PlaylistPanel currentPath={null} onPlay={onPlay} onClose={onClose} />);
    expect(screen.getByText(/Empty playlist/)).toBeTruthy();
  });

  it("renders entries from localStorage", () => {
    setPlaylistEntries(3);
    const onPlay = vi.fn();
    render(<PlaylistPanel currentPath={null} onPlay={onPlay} onClose={vi.fn()} />);
    expect(screen.getByText("Video 0")).toBeTruthy();
    expect(screen.getByText("Video 1")).toBeTruthy();
    expect(screen.getByText("Video 2")).toBeTruthy();
    expect(screen.getByText("3 items")).toBeTruthy();
  });

  it("highlights current entry", () => {
    setPlaylistEntries(3);
    render(<PlaylistPanel currentPath="/video1.mp4" onPlay={vi.fn()} onClose={vi.fn()} />);
    const active = screen.getByText("Video 1").closest('[style*="border-left"]') as HTMLElement | null;
    expect(active).toBeTruthy();
  });

  it("calls onPlay when entry is clicked", () => {
    setPlaylistEntries(1);
    const onPlay = vi.fn();
    render(<PlaylistPanel currentPath={null} onPlay={onPlay} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Video 0"));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ path: "/video0.mp4" }));
  });

  it("removes entry when remove button is clicked", () => {
    setPlaylistEntries(2);
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    const entryDivs = screen.getAllByText("Video 0").map((el) => el.closest('[style*="cursor: pointer"]')).filter(Boolean);
    expect(entryDivs.length).toBe(1);
    const removeButtons = screen.getAllByTitle("Remove");
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByRole("button").filter((b) => b.getAttribute("title") === "Remove").length).toBe(1);
  });

  it("has no duplicate Close button when standalone — closing is via native × [signal: нет дубля Close] [project: cut-player]", () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} standalone />);
    expect(screen.queryByText("Close")).toBeNull();
  });

  it("hides Close button when not standalone", () => {
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("Close")).toBeNull();
  });

  it("reorders entries via drag and drop", () => {
    setPlaylistEntries(3);
    render(<PlaylistPanel currentPath={null} onPlay={vi.fn()} onClose={vi.fn()} />);
    const rows = screen.getAllByText(/^Video \d$/).map((el) => el.closest('[draggable="true"]') as HTMLElement);
    expect(rows.length).toBe(3);
    const dt = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    fireEvent.dragStart(rows[0], { dataTransfer: dt });
    fireEvent.dragOver(rows[2], { dataTransfer: dt });
    fireEvent.drop(rows[2], { dataTransfer: dt });
    fireEvent.dragEnd(rows[0]);
    const stored = JSON.parse(localStorage.getItem("vetka_player_lab_playlist_v1") || "{}");
    expect(stored.entries.map((e: { name: string }) => e.name)).toEqual(["Video 1", "Video 2", "Video 0"]);
  });
});
