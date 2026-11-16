import { describe, expect, it } from "vitest";
import manifestDoc from "../../docs/AGENT_DATA_MANIFEST.md?raw";
import questionDoc from "../../docs/QUESTION_PLAYLIST.md?raw";

// tb_1794846994_51008_1 В: агент (Commander) сказал оператору «в строке гипотеза…»,
// не зная, что строки в карточке нет. Манифест обязан отвечать на «где оператор
// это увидит» по каждому полю записи — агент проверяет глазами по таблице.
const FIELDS = ["name", "caption", "question", "hypothesis", "choices", "in_sec", "out_sec", "duration"];

function section(doc: string, anchor: string): string {
  const start = doc.indexOf(anchor);
  if (start < 0) return "";
  const rest = doc.slice(start + anchor.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("карта «поле записи → где видит оператор»", () => {
  const body = section(manifestDoc, "{#hpdm-fieldmap}");
  it("в манифесте есть раздел с якорем hpdm-fieldmap", () => {
    expect(body.length).toBeGreaterThan(200);
  });
  it("каждое поле записи названо в таблице", () => {
    for (const field of FIELDS) {
      expect(body, `поле ${field}`).toContain(`\`${field}\``);
    }
  });
  it("hypothesis помечена как видимая строка «Module» в карточке, а не подсказка", () => {
    expect(body).toMatch(/hypothesis[^\n]*Module/);
  });
  it("предупреждает: мнение модуля в name — это название строки списка, а не карточка", () => {
    expect(body).toMatch(/name[^\n]*строк[аи] списка/);
  });
  it("QUESTION_PLAYLIST.md ссылается на карту", () => {
    expect(questionDoc).toContain("hpdm-fieldmap");
  });
});
