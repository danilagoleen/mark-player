// tb_1793586334_43420_1: что делает «Send to agent». Кнопка выглядела как
// сохранение, а только копировала готовый answers.json в ack/; набранный в
// поле Comment текст не читался и пропадал при смене слайда (оператор 02.11,
// плейлист r2: 16 вопросов из 44 остались без записи). Теперь текст в поле —
// это ответ verdict=comment, он пишется РАНЬШЕ ack; пустое поле — как прежде.

/** Исход попытки записать ответ карточки: «ignored» — тихие отказы (занято, дубль). */
export type AnswerOutcome = "saved" | "failed" | "ignored";

export interface SendToAgentInput {
  comment: string;
  hasPlaylistPath: boolean;
  hasAnswersDoc: boolean;
  hasActiveQuestion: boolean;
}

export type SendToAgentPlan =
  | { action: "refuse"; reason: "no_playlist" | "no_answers" }
  | { action: "ack" }
  | { action: "save_comment_then_ack"; comment: string };

export function planSendToAgent(input: SendToAgentInput): SendToAgentPlan {
  // Без пути плейлиста answers.json писать некуда; отказ до записи — текст
  // остаётся в поле, ничего не теряется.
  if (!input.hasPlaylistPath) return { action: "refuse", reason: "no_playlist" };
  const comment = input.comment.trim();
  if (comment && input.hasActiveQuestion) return { action: "save_comment_then_ack", comment };
  return input.hasAnswersDoc ? { action: "ack" } : { action: "refuse", reason: "no_answers" };
}
