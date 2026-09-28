import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDragDrop } from "./useDragDrop";

const mockOnDragDropEvent = vi.fn();
let capturedHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null = null;

vi.mock("./nativeWindow", () => ({
  isTauriRuntimeSync: vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: mockOnDragDropEvent,
  }),
}));

import { isTauriRuntimeSync } from "./nativeWindow";

describe("useDragDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;
    mockOnDragDropEvent.mockImplementation((handler: typeof capturedHandler) => {
      capturedHandler = handler;
      return Promise.resolve(vi.fn());
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("does nothing when not in Tauri", () => {
    vi.mocked(isTauriRuntimeSync).mockReturnValue(false);
    renderHook(() => useDragDrop({ onDrop: vi.fn() }));
    expect(mockOnDragDropEvent).not.toHaveBeenCalled();
  });

  it("subscribes to drag-drop in Tauri", async () => {
    vi.mocked(isTauriRuntimeSync).mockReturnValue(true);
    renderHook(() => useDragDrop({ onDrop: vi.fn() }));
    await waitFor(() => {
      expect(mockOnDragDropEvent).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onDrop on drop event with paths", async () => {
    vi.mocked(isTauriRuntimeSync).mockReturnValue(true);
    const onDrop = vi.fn();
    renderHook(() => useDragDrop({ onDrop }));
    await waitFor(() => {
      expect(capturedHandler).toBeTruthy();
    });
    capturedHandler!({ payload: { type: "drop", paths: ["/path/to/file.mp4"] } });
    expect(onDrop).toHaveBeenCalledWith(["/path/to/file.mp4"]);
  });

  it("ignores non-drop events", async () => {
    vi.mocked(isTauriRuntimeSync).mockReturnValue(true);
    const onDrop = vi.fn();
    renderHook(() => useDragDrop({ onDrop }));
    await waitFor(() => {
      expect(capturedHandler).toBeTruthy();
    });
    capturedHandler!({ payload: { type: "over", paths: ["/path"] } });
    expect(onDrop).not.toHaveBeenCalled();
  });
});
