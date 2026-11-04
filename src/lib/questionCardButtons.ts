// tb_1793558199_43420_2: ряд ответов карточки вопроса. Один ряд: у записи есть
// choices — кнопки это и есть варианты (клик = сразу ответ: verdict + choice);
// choices нет — три кнопки Confirm / Reject / Not sure, как было.
import type { AnswerVerdict } from "./questionPlaylist";

export interface AnswerButton {
  /** ключ для React: уникален в ряду */
  key: string;
  label: string;
  verdict: AnswerVerdict;
  /** вариант из choices; пишется в ответ всегда. У трёх кнопок без choices его нет. */
  choice?: string;
  /** data-testid: у вариантов question-choice, у трёх базовых question-answer-<verdict> */
  testId: string;
}

const BASE_BUTTONS: readonly AnswerButton[] = [
  { key: "favorite", label: "Confirm", verdict: "favorite", testId: "question-answer-favorite" },
  { key: "negative", label: "Reject", verdict: "negative", testId: "question-answer-negative" },
  { key: "comment", label: "Not sure", verdict: "comment", testId: "question-answer-comment" },
];

// Вердикт и подпись для вариантов да/нет-вопроса. Любой другой вариант
// (master / model / other / student …) — содержание ответа: «ответ дан» = favorite.
const KNOWN: Record<string, { verdict: AnswerVerdict; label: string }> = {
  confirm: { verdict: "favorite", label: "Confirm" },
  reject: { verdict: "negative", label: "Reject" },
  not_sure: { verdict: "comment", label: "Not sure" },
};

export function answerButtonsFor(choices?: readonly string[]): AnswerButton[] {
  const seen = new Set<string>();
  const buttons: AnswerButton[] = [];
  for (const raw of Array.isArray(choices) ? choices : []) {
    if (typeof raw !== "string") continue;
    const choice = raw.trim();
    if (choice === "" || seen.has(choice)) continue;
    seen.add(choice);
    const known = KNOWN[choice.toLowerCase()];
    buttons.push({
      key: `choice:${choice}`,
      label: known?.label ?? choice,
      verdict: known?.verdict ?? "favorite",
      choice,
      testId: "question-choice",
    });
  }
  return buttons.length > 0 ? buttons : BASE_BUTTONS.map((b) => ({ ...b }));
}
