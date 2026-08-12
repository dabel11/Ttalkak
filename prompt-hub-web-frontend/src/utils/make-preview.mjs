  function makePreview(text) {
    const clean = cleanMakePreviewText(text);
    if (!clean) return "대화 내용 없음";
    return clean.length > 44 ? `${clean.slice(0, 44)}...` : clean;
  }

  function sanitizeMakeBackendMessage(message) {
    const value = String(message || "").trim();
    if (!value) return "";
    const looksLikeAiBody =
      value.length > 120 ||
      /---|\*\*|개선된\s*프롬프트|적용한\s*기법|참고한\s*프롬프트\s*기법|개선\s*포인트|가정한\s*부분/.test(value);
    return looksLikeAiBody ? "" : value;
  }

  function cleanMakePreviewText(text) {
    const section = extractMakePreviewSection(String(text || ""));
    return section
      .replace(/^---+\s*$/gm, " ")
      .replace(/\*\*/g, "")
      .replace(/(?:^|\s)(개선된\s*프롬프트|적용한\s*기법|참고한\s*프롬프트\s*기법|개선\s*포인트|가정한\s*부분)[:：]?\s*/gim, " ")
      .replace(/^[•*-]\s*/gm, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractMakePreviewSection(text) {
    const normalized = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/^---+\s*$/gm, "\n")
      .trim();
    const improvedMatch = normalized.match(
      /\*\*\s*개선된\s*프롬프트\s*[:：]?\s*\*\*([\s\S]*?)(?=\n\s*\*\*\s*(?:적용한\s*기법|참고한\s*프롬프트\s*기법|개선\s*포인트|가정한\s*부분|필요한\s*정보|확인이\s*필요)|$)/i,
    );
    if (improvedMatch?.[1]?.trim()) return improvedMatch[1];
    const askMatch = normalized.match(/\*\*\s*확인이\s*필요해요?.*?\*\*([\s\S]*?)(?=\n\s*[•*-]\s|$)/i);
    if (askMatch?.[1]?.trim()) return askMatch[1];
    return normalized.replace(
      /\n?\s*\*\*\s*(?:적용한\s*기법|참고한\s*프롬프트\s*기법|개선\s*포인트|가정한\s*부분)[:：]?\s*\*\*[\s\S]*$/i,
      "",
    );
  }

  const makePreviewUtils = {
    makePreview,
    sanitizeMakeBackendMessage,
  };
export { makePreviewUtils };
