import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CommentOverlay } from "./components/chat/CommentOverlay";
import { requestPlayerSeek } from "./lib/markerSeek";

vi.mock("./lib/markerSeek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/markerSeek")>();
  return { ...actual, requestPlayerSeek: vi.fn() };
});

const MARKERS = [
  { marker_id: "m1", kind: "comment", start_sec: 1, text: "first" },
  { marker_id: "m2", kind: "comment", start_sec: 3, text: "second" },
];

function renderTwoSelectedFirst() {
  const onUpdateText = vi.fn();
  const onDeleteMarker = vi.fn();
  const utils = render(
    <CommentOverlay
      marker={MARKERS[0]}
      markers={MARKERS}
      onClose={() => {}}
      onUpdateText={onUpdateText}
      onDeleteMarker={onDeleteMarker}
      standalone
    />,
  );
  return { ...utils, onUpdateText, onDeleteMarker };
}

function buttonsByName(container: HTMLElement, name: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  ) as HTMLButtonElement[];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CommentOverlay (баг 2026-09-27: правится только выбранный)", () => {
  it("Edit есть у КАЖДОГО коммента, а не только у ?marker=", () => {
    const { container } = renderTwoSelectedFirst();
    expect(buttonsByName(container, "Edit comment")).toHaveLength(2);
  });

  it("Save второго коммента зовёт onUpdateText с его id", () => {
    const { container, onUpdateText } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Edit comment")[1]);
    const area = container.querySelector("textarea")!;
    fireEvent.change(area, { target: { value: "second edited" } });
    fireEvent.click(buttonsByName(container, "Save")[0]);
    expect(onUpdateText).toHaveBeenCalledWith("m2", "second edited");
  });

  it("Delete есть у каждого коммента; один клик зовёт onDeleteMarker с его id", () => {
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    const dels = buttonsByName(container, "Delete comment");
    expect(dels).toHaveLength(2);
    fireEvent.click(dels[0]);
    expect(onDeleteMarker).toHaveBeenCalledWith("m1");
  });
});

describe("CommentOverlay удаление в один клик (tb_1791662788_27409_4)", () => {
  it("корзина удаляет сразу, штриховки и Confirm delete нет", () => {
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Delete comment")[1]);
    expect(onDeleteMarker).toHaveBeenCalledTimes(1);
    expect(onDeleteMarker).toHaveBeenCalledWith("m2");
    expect(buttonsByName(container, "Confirm delete")).toHaveLength(0);
    expect(container.querySelectorAll('[data-armed="true"]')).toHaveLength(0);
  });

  it("в разметке нет красного", () => {
    const { container } = renderTwoSelectedFirst();
    expect(container.innerHTML).not.toMatch(/f87171|248,\s*113,\s*113|#f00|red/i);
  });
});

describe("CommentOverlay Clear all (0.20)", () => {
  it("кнопка видна с onClearAll и зовёт его", () => {
    const onClearAll = vi.fn();
    const { container } = render(
      <CommentOverlay
        marker={MARKERS[0]}
        markers={MARKERS}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        onClearAll={onClearAll}
        standalone
      />,
    );
    const btns = buttonsByName(container, "Clear all");
    expect(btns).toHaveLength(1);
    fireEvent.click(btns[0]);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("кнопки нет без onClearAll", () => {
    const { container } = renderTwoSelectedFirst();
    expect(buttonsByName(container, "Clear all")).toHaveLength(0);
  });
});

describe("CommentOverlay все виды (_18)", () => {
  const MIXED = [
    { marker_id: "m1", kind: "comment", start_sec: 1, anchor_sec: 1, text: "first" },
    { marker_id: "f1", kind: "favorite", start_sec: 2, anchor_sec: 2 },
    { marker_id: "i1", kind: "in", start_sec: 3, anchor_sec: 3 },
    { marker_id: "o1", kind: "out", start_sec: 6, anchor_sec: 6 },
  ];

  function renderMixed() {
    return render(
      <CommentOverlay
        marker={null}
        markers={MIXED}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        standalone
      />,
    );
  }

  it("рендерит все виды, а не только комменты", () => {
    const { container } = renderMixed();
    const rows = container.querySelectorAll('[data-testid="comment-row"]');
    expect(rows).toHaveLength(4);
    expect(container.textContent).toContain("★");
    expect(container.textContent).toContain("💬");
  });

  it("у спаренных in/out — хрон сегмента", () => {
    const { container } = renderMixed();
    expect(container.textContent).toContain("sel 00:00:03:00");
  });

  it("клик по строке просит прыжок через markerSeek", () => {
    const { container } = renderMixed();
    vi.mocked(requestPlayerSeek).mockClear();
    const rows = container.querySelectorAll('[data-testid="comment-row"]');
    fireEvent.click(rows[1]);
    expect(requestPlayerSeek).toHaveBeenCalledWith(2);
  });

  it("Edit только у comment, Delete-armed у всех", () => {
    const { container } = renderMixed();
    expect(buttonsByName(container, "Edit comment")).toHaveLength(1);
    const dels = Array.from(container.querySelectorAll("button")).filter(
      (b) => (b.getAttribute("aria-label") || "").startsWith("Delete"),
    );
    expect(dels).toHaveLength(4);
  });
});

// tb_1791583578_64923_1: автор строкой (статусов больше нет — задачи в таскборде).
describe("CommentOverlay автор", () => {
  const AUTHORED = [
    { marker_id: "m1", kind: "comment", start_sec: 1, text: "first", author: "agent:Beta" },
    { marker_id: "m2", kind: "comment", start_sec: 3, text: "second", author: "Danila" },
    { marker_id: "m3", kind: "comment", start_sec: 5, text: "third" },
  ];

  function renderAuthored() {
    return render(
      <CommentOverlay
        marker={null}
        markers={AUTHORED}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        standalone
      />,
    );
  }

  it("автор строкой, у агента бейдж AI; без автора строки нет", () => {
    const { container } = renderAuthored();
    const authors = container.querySelectorAll('[data-testid="comment-author"]');
    expect(authors).toHaveLength(2);
    expect(authors[0].textContent).toContain("agent:Beta");
    expect(authors[0].textContent).toContain("AI");
    expect(authors[1].textContent).toContain("Danila");
    expect(authors[1].textContent).not.toContain("AI");
  });

  it("галочек и статусных фильтров нет", () => {
    const { container } = renderAuthored();
    expect(container.querySelectorAll('[data-testid="comment-done-toggle"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="comment-reply-toggle"]')).toHaveLength(0);
    expect(buttonsByName(container, "To do")).toHaveLength(0);
    expect(buttonsByName(container, "Done")).toHaveLength(0);
  });
});

// tb_1791585558_31907_1: reply-средний — плоская строка ↳ под родителем.
describe("CommentOverlay replies", () => {
  const FAMILY = [
    { marker_id: "p1", kind: "comment", start_sec: 1, text: "вопрос", author: "agent:Beta" },
    { marker_id: "r1", kind: "comment", start_sec: 2, text: "ответ", author: "Danila", reply_to: "p1" },
    { marker_id: "lonely", kind: "comment", start_sec: 3, text: "сам по себе" },
    { marker_id: "orphan", kind: "comment", start_sec: 4, text: "сирота", reply_to: "nope" },
  ];

  function renderFamily() {
    return render(
      <CommentOverlay
        marker={null}
        markers={FAMILY}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        standalone
      />,
    );
  }

  it("ответ — строкой ↳ под родителем, а не отдельной историей", () => {
    const { container } = renderFamily();
    // корни: p1, lonely, orphan (сирота — обычной строкой)
    expect(container.querySelectorAll('[data-testid="comment-row"]')).toHaveLength(3);
    const replies = container.querySelectorAll('[data-testid="comment-reply"]');
    expect(replies).toHaveLength(1);
    expect(replies[0].textContent).toContain("↳");
    expect(replies[0].textContent).toContain("Danila:");
    expect(replies[0].textContent).toContain("ответ");
  });
});

// tb_1791586270_32802_2: кнопка Reply — человек отвечает из UI.
describe("CommentOverlay reply form", () => {
  function renderWithReply() {
    const onReply = vi.fn();
    const utils = render(
      <CommentOverlay
        marker={null}
        markers={[
          { marker_id: "p1", kind: "comment", start_sec: 1, text: "вопрос", author: "agent:Beta" },
        ]}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        onReply={onReply}
        standalone
      />,
    );
    return { ...utils, onReply };
  }

  it("без onReply кнопки Reply нет", () => {
    const { container } = renderTwoSelectedFirst();
    expect(container.querySelectorAll('[data-testid="comment-reply-btn"]')).toHaveLength(0);
  });

  it("клик Reply открывает форму, Send зовёт onReply с id родителя и текстом", () => {
    const { container, onReply } = renderWithReply();
    expect(container.querySelectorAll('[data-testid="comment-reply-btn"]')).toHaveLength(1);
    fireEvent.click(container.querySelector('[data-testid="comment-reply-btn"]')!);
    const input = container.querySelector('[data-testid="comment-reply-input"]') as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    // пустая форма не отправляется
    expect((container.querySelector('[data-testid="comment-reply-send"]') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "отвечаю" } });
    fireEvent.click(container.querySelector('[data-testid="comment-reply-send"]')!);
    expect(onReply).toHaveBeenCalledWith("p1", "отвечаю");
    expect(container.querySelector('[data-testid="comment-reply-form"]')).toBeNull();
  });

  it("Cancel закрывает форму без вызова", () => {
    const { container, onReply } = renderWithReply();
    fireEvent.click(container.querySelector('[data-testid="comment-reply-btn"]')!);
    fireEvent.change(container.querySelector('[data-testid="comment-reply-input"]')!, { target: { value: "x" } });
    fireEvent.click(buttonsByName(container, "Cancel")[0]);
    expect(onReply).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="comment-reply-form"]')).toBeNull();
  });
});

// tb_1791654032_27281_1: единое окно Markers — kind-фильтр, создание по Save,
// пустой коммент удаляется.
describe("CommentOverlay markers window", () => {
  const MIXED = [
    { marker_id: "c1", kind: "comment", start_sec: 1, text: "note" },
    { marker_id: "f1", kind: "favorite", start_sec: 2 },
    { marker_id: "i1", kind: "in", start_sec: 3, anchor_sec: 3 },
  ];

  function renderMarkers(extra = {}) {
    const onCreate = vi.fn();
    const utils = render(
      <CommentOverlay
        marker={null}
        markers={MIXED}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        onCreate={onCreate}
        standalone
        {...extra}
      />,
    );
    return { ...utils, onCreate };
  }

  it("заголовок Markers, фильтр — иконки видов", () => {
    const { container } = renderMarkers();
    expect(container.textContent).toContain("Markers");
    for (const id of ["all", "favorite", "negative", "in", "out", "comment"]) {
      expect(container.querySelector(`[data-testid="comment-filter-${id}"]`)).toBeTruthy();
    }
  });

  it("kind-фильтр режет список: только favorites", () => {
    const { container } = renderMarkers();
    expect(container.querySelectorAll('[data-testid="comment-row"]')).toHaveLength(3);
    fireEvent.click(container.querySelector('[data-testid="comment-filter-favorite"]')!);
    const rows = container.querySelectorAll('[data-testid="comment-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-kind")).toBe("favorite");
    fireEvent.click(container.querySelector('[data-testid="comment-filter-all"]')!);
    expect(container.querySelectorAll('[data-testid="comment-row"]')).toHaveLength(3);
  });

  it("Save в форме зовёт onCreate с текстом и чистит поле; пустое не отправляется", () => {
    const { container, onCreate } = renderMarkers();
    const input = container.querySelector('[data-testid="comment-new-input"]') as HTMLTextAreaElement;
    expect((container.querySelector('[data-testid="comment-new-save"]') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "новая мысль" } });
    fireEvent.click(container.querySelector('[data-testid="comment-new-save"]')!);
    expect(onCreate).toHaveBeenCalledWith("новая мысль");
    expect((container.querySelector('[data-testid="comment-new-input"]') as HTMLTextAreaElement).value).toBe("");
  });

  it("без onCreate формы нет", () => {
    const { container } = renderTwoSelectedFirst();
    expect(container.querySelector('[data-testid="comment-new-form"]')).toBeNull();
  });

  it("пустой коммент удаляется: один клик зовёт onDeleteMarker", () => {
    const onDeleteMarker = vi.fn();
    const { container } = render(
      <CommentOverlay
        marker={null}
        markers={[{ marker_id: "e1", kind: "comment", start_sec: 1, text: "" }]}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={onDeleteMarker}
        standalone
      />,
    );
    const dels = buttonsByName(container, "Delete comment");
    expect(dels).toHaveLength(1);
    fireEvent.click(dels[0]);
    expect(onDeleteMarker).toHaveBeenCalledWith("e1");
  });
});

describe("CommentOverlay initialKindFilter (tb_1791690899_1275_3: фильтр с иконки)", () => {  const MIXED = [
    { marker_id: "c1", kind: "comment", start_sec: 1, text: "t" },
    { marker_id: "f1", kind: "favorite", start_sec: 2, text: "f" },
    { marker_id: "i1", kind: "in", start_sec: 3 },
  ];
  function rowsWith(filter?: "all" | "comment") {
    const utils = render(
      <CommentOverlay
        marker={null}
        markers={MIXED}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        standalone
        initialKindFilter={filter}
      />,
    );
    return utils.container.querySelectorAll('[data-testid="comment-row"]').length;
  }
  it("без флага — все виды", () => {
    expect(rowsWith()).toBe(3);
  });
  it("initialKindFilter=comment — только комменты", () => {
    expect(rowsWith("comment")).toBe(1);
  });
});

// tb_1791837678_26192_1: нитки не режутся фильтром — ответы-вердикты (★/✕)
// видны под 💬-фильтром, qmat-родитель виден под ★-фильтром.
describe("CommentOverlay threads survive kind filter", () => {
  const THREAD = [
    { marker_id: "qmat_mrg-01_in", kind: "comment", start_sec: 7, text: "вопрос?", question_id: "mrg-01" },
    { marker_id: "reply_fav", kind: "favorite", start_sec: 8, text: "[answer] (favorite)", reply_to: "qmat_mrg-01_in" },
    { marker_id: "reply_neg", kind: "negative", start_sec: 9, text: "[answer] (negative)", reply_to: "qmat_mrg-01_in" },
    { marker_id: "plain", kind: "comment", start_sec: 1, text: "мимо" },
  ];
  function renderThread(filter?: "all" | "comment" | "favorite") {
    const { container } = render(
      <CommentOverlay
        marker={null}
        markers={THREAD}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        standalone
        initialKindFilter={filter}
      />,
    );
    return container;
  }
  it("💬-фильтр: ответы ★/✕ на месте (нитка цела)", () => {
    const container = renderThread("comment");
    const replies = container.querySelectorAll('[data-testid="comment-reply"]');
    expect(replies).toHaveLength(2);
    expect(container.textContent).toContain("★");
    expect(container.textContent).toContain("✗");
  });
  it("★-фильтр: родитель вопроса подтянут, ответы — под ним, а не сироты", () => {
    const container = renderThread("favorite");
    // родитель + ответ-favorite (нитка), negative-ответ тоже виден (reply_to)
    expect(container.querySelectorAll('[data-testid="comment-row"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="comment-reply"]')).toHaveLength(2);
    expect(container.textContent).toContain("вопрос?");
  });
});
