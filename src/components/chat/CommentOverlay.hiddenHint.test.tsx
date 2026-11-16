import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CommentOverlay } from "./CommentOverlay";

vi.mock("../../lib/markerSeek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/markerSeek")>();
  return { ...actual, requestPlayerSeek: vi.fn() };
});

// tb_1794846994_51008_1 А: окно, открытое 💬/M, стартует с фильтром comments и
// раньше молча прятало ★/✗ оператора («не записывается в окно маркеров»).
// Теперь окно пишет, сколько скрыто, и одним кликом показывает всё.
const MARKERS = [
  { marker_id: "qmat_q1_in", kind: "in", start_sec: 0, text: "Отметьте…", author: "agent:Commander" },
  { marker_id: "ans1", kind: "negative", start_sec: 1.4, text: "[answer] (negative)", reply_to: "qmat_q1_in" },
  { marker_id: "n1", kind: "negative", start_sec: 0.1 },
  { marker_id: "f1", kind: "favorite", start_sec: 3 },
];

function renderOverlay(initialKindFilter?: "all" | "comment") {
  return render(
    <CommentOverlay
      marker={null}
      markers={MARKERS}
      onClose={() => {}}
      onUpdateText={() => {}}
      onDeleteMarker={() => {}}
      standalone
      initialKindFilter={initialKindFilter}
    />,
  );
}

afterEach(() => cleanup());

describe("CommentOverlay: скрытое фильтром названо", () => {
  it("под фильтром comment есть строка «скрыто» с числом и видами", () => {
    const { getByTestId } = renderOverlay("comment");
    const hint = getByTestId("comment-hidden-hint");
    expect(hint.textContent).toContain("2");
    expect(hint.textContent).toContain("★ 1");
    expect(hint.textContent).toContain("✗ 1");
  });

  it("клик по строке снимает фильтр: ★ и ✗ появляются в списке", () => {
    const { getByTestId, queryByTestId, getAllByTestId } = renderOverlay("comment");
    expect(getAllByTestId("comment-row").some((r) => r.getAttribute("data-kind") === "favorite")).toBe(false);
    fireEvent.click(getByTestId("comment-hidden-hint"));
    const kinds = getAllByTestId("comment-row").map((r) => r.getAttribute("data-kind"));
    expect(kinds).toContain("favorite");
    expect(kinds).toContain("negative");
    expect(queryByTestId("comment-hidden-hint")).toBeNull();
  });

  it("под фильтром all строки нет", () => {
    const { queryByTestId } = renderOverlay("all");
    expect(queryByTestId("comment-hidden-hint")).toBeNull();
  });
});
