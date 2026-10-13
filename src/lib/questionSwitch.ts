// tb_1791865804_84020_6: карточка вопроса — из ТЕКУЩЕЙ записи.
// Кейс Beta v01: все 28 ответов выгрузились с question_id=mrg-01 — карточка
// не переключалась при смене записи, ответы залипали на первом вопросе.
// Правило Commander: при смене записи плейлиста / переходе по маркеру
// карточка и question_id ответа берутся из текущей записи.
// Чистый модуль без DOM: по записям + пути (+ явный вопрос, если зовут
// с ним — клик панели) возвращает question_id для activateQuestionFor.
import { findQuestionEntry } from "./questionPlaylist";
import type { Playlist } from "./playlist";

/** question_id текущей записи: явный вопрос важнее, иначе первая запись пути, иначе null. */
export function resolveQuestionForPath(
  entries: unknown,
  path: string | null | undefined,
  explicitQuestionId?: string | null,
): string | null {
  if (!Array.isArray(entries)) return null;
  const hit = findQuestionEntry({ entries } as Playlist, {
    questionId: explicitQuestionId ?? null,
    path: path ?? null,
  });
  return hit?.question_id ?? null;
}
