// tb_1794846994_51008_1 (В): строка «Module: …» в карточке вопроса.
//
// Агент кладёт в запись плейлиста `hypothesis` — что о месте думает модуль
// («transit 57.5 с, truck 20 с…»). Манифест обещал, что оператор это видит, а
// карточка показывала hypothesis только во всплывающей подсказке: Commander
// вписал мнение модуля в название записи, оператор не понял, где «гипотеза».
// Теперь это отдельная строка под заголовком; пустая hypothesis — строки нет.

export function QuestionHypothesisLine({ hypothesis }: { hypothesis?: string | null }) {
  const text = typeof hypothesis === "string" ? hypothesis.trim() : "";
  if (!text) return null;
  return (
    <div className="question-card-side-hypothesis" data-testid="question-hypothesis" title={text}>
      <span className="question-card-side-hypothesis-label">Module</span> {text}
    </div>
  );
}
