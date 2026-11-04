// tb_1793586334_43420_1: косметика окна Markers. Ответ-вариант (student / other …)
// уходит с verdict=favorite («ответ дан»), и нитка рисовала ★ вида и приписку
// «(favorite)», хотя такого варианта у вопроса нет (оператор 02.11). Формат
// ответа не трогаем: его читают агент и answers.json. Меняется только то, что
// видит оператор: у ответа-варианта нет ни ★, ни вердикта в скобках.
import { parseAnswerReplyText } from "./questionPlaylist";

export interface AnswerReplyView {
  text: string;
  /** рисовать ли глиф вида (★ / ✗) перед ответом */
  showKindGlyph: boolean;
}

// Варианты да/нет-вопроса сами и есть вердикт: ★ / ✗ для них законны.
const VERDICT_CHOICES = new Set(["confirm", "reject", "not_sure"]);

export function answerReplyView(text: string, choices?: readonly string[] | null): AnswerReplyView {
  const plain: AnswerReplyView = { text, showKindGlyph: true };
  const known = Array.isArray(choices) ? choices : [];
  if (known.length === 0) return plain;
  const parsed = parseAnswerReplyText(text);
  // Скрываем только «ответ дан»: negative/comment несут смысл, их не стираем.
  if (!parsed || parsed.verdict !== "favorite") return plain;
  // Вариантом считается лишь то, что есть в списке вариантов вопроса:
  // «see: here» в комментарии Confirm вариантом не становится.
  const head = parsed.choice ?? parsed.single;
  if (!head || !known.includes(head)) return plain;
  if (VERDICT_CHOICES.has(head.toLowerCase())) return plain;
  const comment = parsed.choice ? parsed.comment : undefined;
  return { text: comment ? `[answer] ${head}: ${comment}` : `[answer] ${head}`, showKindGlyph: false };
}
