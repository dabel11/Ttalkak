  "use strict";

  function normalizeSearchText(value) {
    return String(value || "")
      .replace(/^#+/, "")
      .replace(/[#,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeTag(value) {
    return value.replace(/^#+/, "").trim().toLowerCase();
  }

  function isValidPhone(value) {
    return /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(String(value || "").trim());
  }

  function isFutureDate(value) {
    if (!value) return false;

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return date > today;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function getFinalPromptText(message) {
    const explicitPrompt = String(
      message?.executablePrompt ||
        message?.improvedPrompt ||
        message?.finalPrompt ||
        message?.final_prompt ||
        "",
    ).trim();
    if (explicitPrompt) return explicitPrompt;
    if (message?.role === "assistant") return "";

    const content = String(message?.content || "");
    const marker = "역할:";
    const markerIndex = content.indexOf(marker);

    if (markerIndex > 0 && content.slice(0, markerIndex).includes("개선")) {
      return content.slice(markerIndex).trim();
    }

    return content.trim();
  }

  function formatNumber(value) {
    const number = Number(value);
    return new Intl.NumberFormat("ko-KR").format(
      Number.isFinite(number) ? number : 0
    );
  }

  function parseTimestamp(value) {
    if (!value) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatShortDate(value) {
    const time = parseTimestamp(value);
    if (!time) return "방금 생성";

    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  }

  const utils = Object.freeze({
    normalizeSearchText,
    normalizeTag,
    isValidPhone,
    isFutureDate,
    escapeHtml,
    escapeAttr,
    getFinalPromptText,
    formatNumber,
    formatShortDate,
    parseTimestamp,
  });
export { utils };
