export function parseLegacyImproveAnswer(value) {
  const source = String(value || "").trim();
  const empty = { lead: "", improvedPrompt: "", questions: [], changes: [], techniques: [] };
  if (!source || !/(---|\*\*)/.test(source)) return empty;

  const sections = { lead: [], improvedPrompt: [], questions: [], changes: [], techniques: [] };
  let section = "lead";

  source
    .replace(/\r\n/g, "\n")
    .replace(/^---+\s*$/gm, "\n")
    .replace(/\*\*/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const heading = line.replace(/[:：]\s*$/, "").trim();
      if (/^(개선된\s*프롬프트|improved\s*prompt)$/i.test(heading)) {
        section = "improvedPrompt";
        return;
      }
      if (/^(적용한\s*기법|참고한\s*프롬프트\s*기법)$/i.test(heading)) {
        section = "techniques";
        return;
      }
      if (/^(개선\s*포인트|가정한\s*부분)$/i.test(heading)) {
        section = "changes";
        return;
      }
      if (/^(확인이\s*필요|필요한\s*정보|추가\s*질문)/i.test(heading)) {
        section = "questions";
        return;
      }

      const bullet = line.match(/^[•*-]\s*(.+)$/);
      const bulletText = bullet ? bullet[1].trim() : line;
      const pair = bulletText.match(/^([^:：]{1,48})[:：]\s*(.+)$/);

      if (section === "questions") {
        if (!bullet && !pair && !/[?？]$/.test(bulletText)) {
          sections.lead.push(bulletText);
          return;
        }
        sections.questions.push({
          field: pair ? pair[1].trim() : "",
          question: pair ? pair[2].trim() : bulletText,
          reason: "",
          importance: "required",
        });
        return;
      }
      if (section === "techniques") {
        sections.techniques.push({
          name: pair ? pair[1].trim() : bulletText,
          reason: pair ? pair[2].trim() : "",
        });
        return;
      }
      if (section === "changes") {
        sections.changes.push(bulletText);
        return;
      }
      if (section === "improvedPrompt") {
        sections.improvedPrompt.push(line);
        return;
      }
      sections.lead.push(line);
    });

  return {
    lead: sections.lead.join("\n"),
    improvedPrompt: sections.improvedPrompt.join("\n"),
    questions: sections.questions,
    changes: sections.changes,
    techniques: sections.techniques,
  };
}
