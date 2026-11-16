// tb_1794800630_73214_1 / tb_1794865760_47995_3: два инструмента на одной шкале
// (слово оператора 16.11 — вариант Б; уточнение 17.11 — «черта» и «скобки»).
// В хранилище одна правда — маркеры (qmat in/out режут клипы в XML), но
// инструментов два, и делит их НАЗНАЧЕНИЕ, а не автор:
//   · «черта» — qmat_<вопрос>_in/_out агента: подчёркивает участок, о котором
//     опрос; карточка и кнопки ответов привязаны к ней; спаривается ПО
//     ИДЕНТИФИКАТОРУ вопроса, рисуется формой на шкале (не знаками [ ]),
//     оператор её не двигает;
//   · «скобки» — in/out монтажа: инструмент выбора видео в монтаж, ставит человек
//     (позже и агент, когда покажет набросок монтажа): [ ] в основном ряду,
//     гард вложенности, хронометраж, ножницы вне опроса.
// В плейлисте опроса ножницы играют ТОЛЬКО черту активного вопроса; скобки
// оператора там — ответ агенту (origin = operator_range), набросок монтажа они
// там не делают. Чистый модуль: вся логика ролей здесь, App только подставляет
// данные.
import { buildPlaybackSegments, wouldNestInPair, type PlaybackSegment } from "./inOutPlayback";
import { isQuestionLineMarker, pairInOutRanges, lineGroupKey } from "./selectionDuration";

export { isQuestionLineMarker, lineGroupKey };

export interface LayerMark {
  marker_id: string;
  kind: string;
  anchor_sec: number;
}

/** Черту вопроса оператор не двигает; скобки монтажа и прочие маркеры — как раньше. */
export function isMarkerDraggable(m: { marker_id?: unknown; kind?: unknown } | null | undefined): boolean {
  return !isQuestionLineMarker(m);
}

/** Скобки монтажа: in/out, не принадлежащие черте вопроса (кто бы их ни поставил). */
export function bracketMarks<T extends LayerMark>(marks: T[]): T[] {
  return marks.filter((m) => (m.kind === "in" || m.kind === "out") && !isQuestionLineMarker(m));
}

/**
 * Гард вложенности только против пар СКОБОК: черта вопроса (в gold_keys_v1
 * у 11 из 12 записей — весь клип) поставить скобку внутри не мешает.
 */
export function wouldNestInBracketPair(marks: LayerMark[], anchor: number): boolean {
  const bracketPairs = pairInOutRanges(marks).pairs.filter((p) => p.layer === "bracket");
  return wouldNestInPair(bracketPairs, anchor);
}

/**
 * Сегменты ножниц (In–Out Play). Правило оператора 17.11:
 *  1. У файла есть черта активного вопроса — играет ТОЛЬКО она (одинокий IN —
 *     до конца файла, OUT за концом файла обрезается). Агент спрашивает про
 *     конкретный участок, оператору не нужно смотреть монтаж по своим скобкам;
 *     его скобки тут — ответ, в ножницах не играют.
 *  2. Черты нет (нет вопроса, вопрос «весь файл», вопрос другого файла) —
 *     играют скобки монтажа, как обычно.
 *  3. Ни черты, ни скобок — сегментов нет. Черты неактивных вопросов не играют.
 */
export function scissorsSegments(
  marks: LayerMark[],
  activeLine: { in_sec?: unknown; out_sec?: unknown } | null | undefined,
  duration: number,
): PlaybackSegment[] {
  const dur = Number(duration || 0);
  const inSec = activeLine ? Number(activeLine.in_sec) : Number.NaN;
  if (activeLine && typeof activeLine.in_sec === "number" && Number.isFinite(inSec) && inSec >= 0) {
    const rawOut = typeof activeLine.out_sec === "number" ? activeLine.out_sec : Number.NaN;
    const hasOut = Number.isFinite(rawOut) && rawOut > inSec;
    const end = hasOut ? (dur > 0 ? Math.min(rawOut, dur) : rawOut) : dur > 0 ? dur : Number.POSITIVE_INFINITY;
    if (end > inSec) return [{ start: inSec, end }];
  }
  const brackets = bracketMarks(marks);
  return buildPlaybackSegments(
    brackets.filter((m) => m.kind === "in").map((m) => m.anchor_sec),
    brackets.filter((m) => m.kind === "out").map((m) => m.anchor_sec),
    dur,
  );
}
