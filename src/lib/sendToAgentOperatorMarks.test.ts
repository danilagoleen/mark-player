// tb_1794347727_83767_1: «Send to agent» должна отдавать агенту и СОБСТВЕННЫЕ
// маркеры оператора внутри in/out записи (кейс reelsD-201336, 11.11). Чистая
// часть — operatorMarkerAnswers.test.ts; здесь — проводка в App.tsx: перед ack
// документ пересобирается из маркеров, слияние зеркалит маркеры оператора, а
// кнопка не отказывает «no answers yet», когда у оператора есть только свои маркеры.
import { describe, expect, it } from "vitest";
import appSrc from "../App.tsx?raw";

describe("проводка в App.tsx: свои маркеры оператора доходят до answers.json и ack", () => {
  const sendStart = appSrc.indexOf("async function sendAnswersToAgent(");
  const sendEnd = appSrc.indexOf("async function refreshAnswersProgress(");
  const sendBody = sendStart >= 0 && sendEnd > sendStart ? appSrc.slice(sendStart, sendEnd) : "";

  it("есть refreshAnswersDocFromMarkers: пересборка answers.json из ВСЕХ маркеров", () => {
    expect(appSrc).toContain("async function refreshAnswersDocFromMarkers(");
  });

  it("sendAnswersToAgent пересобирает документ из маркеров РАНЬШЕ записи ack (пустое поле тоже)", () => {
    expect(sendBody).not.toBe("");
    const refresh = sendBody.indexOf("refreshAnswersDocFromMarkers(");
    const ack = sendBody.indexOf("writeAnswersAckFile(");
    expect(refresh).toBeGreaterThan(-1);
    expect(ack).toBeGreaterThan(refresh);
  });

  it("свои маркеры без единого ответа карточки — не «no answers yet»: hasAnswersDoc учитывает маркеры", () => {
    const plan = sendBody.indexOf("planSendToAgent(");
    const hasDoc = sendBody.indexOf("hasAnswersDoc:", plan);
    expect(hasDoc).toBeGreaterThan(plan);
    const line = sendBody.slice(hasDoc, sendBody.indexOf("\n", hasDoc));
    expect(line).toContain("answersDocRef.current");
    expect(line).toMatch(/\|\|/);
  });

  it("слияние во всех трёх местах (ответ в файл, ответ в аутбокс, пересборка) зеркалит маркеры оператора", () => {
    const merges = appSrc.split("mergeAnswerRecords(").length - 1;
    const mirrored = appSrc.split("replaceOperatorMarkersIn").length - 1;
    expect(merges).toBeGreaterThanOrEqual(3);
    expect(mirrored).toBeGreaterThanOrEqual(3);
  });

  it("область зеркала берётся из тех же маркеров: questionScopeFromMarkers", () => {
    expect(appSrc).toContain("questionScopeFromMarkers(");
  });

  it("тост отправки называет, сколько своих маркеров ушло", () => {
    expect(sendBody).toContain("own marker");
  });
});
