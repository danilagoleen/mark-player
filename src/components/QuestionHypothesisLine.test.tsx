import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QuestionHypothesisLine } from "./QuestionHypothesisLine";

// tb_1794846994_51008_1 В: manifest и Commander обещали «строку hypothesis» в
// карточке вопроса, а плеер показывал её только во всплывающей подсказке.
afterEach(() => cleanup());

describe("QuestionHypothesisLine", () => {
  it("показывает hypothesis отдельной видимой строкой с подписью Module", () => {
    const { getByTestId } = render(<QuestionHypothesisLine hypothesis="модуль: transit 57.5 с, truck 20 с" />);
    const line = getByTestId("question-hypothesis");
    expect(line.textContent).toContain("Module");
    expect(line.textContent).toContain("модуль: transit 57.5 с, truck 20 с");
  });
  it("пустая / пробельная / отсутствующая hypothesis — строки нет, место не занято", () => {
    for (const value of [undefined, null, "", "   "]) {
      const { container, unmount } = render(<QuestionHypothesisLine hypothesis={value} />);
      expect(container.querySelector("[data-testid='question-hypothesis']")).toBeNull();
      unmount();
    }
  });
  it("длинная hypothesis режется CSS-ом, а полный текст остаётся в title", () => {
    const long = "x".repeat(500);
    const { getByTestId } = render(<QuestionHypothesisLine hypothesis={long} />);
    expect(getByTestId("question-hypothesis").getAttribute("title")).toBe(long);
  });
});
