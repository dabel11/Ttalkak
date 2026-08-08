import { parseLegacyImproveAnswer } from "../utils/legacyImproveAnswer";
import {
  normalizeImproveChanges as normalizeMessageChanges,
  normalizeImproveFields as normalizeMessageFields,
  normalizeImproveQuestions as normalizeMessageQuestions,
  normalizeImproveTechniques as normalizeMessageTechniques,
} from "../utils/normalizeImproveResult";

export function AssistantResponse({ message, isAsk }) {
  const parsed = parseAssistantSections(message);
  const content =
    parsed.improvedPrompt ||
    (isAsk ? message.summary || message.answer || parsed.lead : parsed.lead || message.content);
  const questions = mergeLists(message.questions, parsed.questions);
  const changes = mergeLists(message.changes, parsed.changes);
  const techniques = mergeLists(message.techniques || message.techniquesApplied, parsed.techniques);

  return (
    <>
      {!isAsk && <EvidenceNotice ragStatus={message.ragStatus} />}
      {content && (
        <p style={{ whiteSpace: "pre-wrap" }}>
          <PromptText text={content} />
        </p>
      )}
      <FieldList fields={message.fields} />
      <ChangeList changes={changes} />
      <QuestionList questions={questions} mode={message.mode} summary={message.summary} />
      <TechniqueList techniques={techniques} />
    </>
  );
}

export function PromptText({ text }) {
  const source = String(text || "");
  const pattern = /\[[^\]\n]{1,80}\]/g;
  const parts = [];
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) parts.push(source.slice(cursor, match.index));
    parts.push(
      <span className="prompt-placeholder-chip" title="채워 넣으면 더 정확해지는 정보입니다." key={`placeholder-${match.index}`}>
        {match[0]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) parts.push(source.slice(cursor));
  return <>{parts.length ? parts : source}</>;
}

export function hasExecutablePrompt(message) {
  if (!message?.executablePrompt || message.mode === "ask") return false;
  if (isUtilityOnlyPrompt(message.executablePrompt)) return false;
  const combinedText = [
    message.executablePrompt,
    message.content,
    message.answer,
    message.summary,
  ]
    .filter(Boolean)
    .join("\n");
  return !isAskOnlyResponse(combinedText);
}

function mergeLists(primary, secondary) {
  return [
    ...(Array.isArray(primary) ? primary : []),
    ...(Array.isArray(secondary) ? secondary : []),
  ];
}

function parseAssistantSections(message) {
  return parseLegacyImproveAnswer(message?.content || message?.answer || "");
}

function ChangeList({ changes }) {
  const normalizedChanges = normalizeMessageChanges(changes);
  if (!normalizedChanges.length) return null;

  return (
    <div className="assumption-list" aria-label="가정 및 개선 포인트">
      <strong>가정 및 개선 포인트</strong>
      <ul>
        {normalizedChanges.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function FieldList({ fields }) {
  const normalizedFields = normalizeMessageFields(fields).filter((item) => item.status !== "filled");
  if (!normalizedFields.length) return null;

  return (
    <div className="field-list" aria-label="채워야 할 정보">
      <strong>채워야 할 정보</strong>
      <ul>
        {normalizedFields.map((item, index) => (
          <li className={item.role} key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <em>{item.role === "required" ? "필수" : item.role === "fact" ? "사실 확인" : "선택"}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TechniqueList({ techniques }) {
  const normalizedTechniques = normalizeMessageTechniques(techniques);
  if (!normalizedTechniques.length) return null;

  return (
    <div className="technique-list" aria-label="참고한 프롬프트 기법">
      <strong>참고한 프롬프트 기법</strong>
      <ul>
        {normalizedTechniques.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            {item.reason && <small>{item.reason}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceNotice({ ragStatus }) {
  if (String(ragStatus || "").toLowerCase() !== "no_evidence") return null;
  return (
    <div className="evidence-notice">
      <span>참고 근거 없이 기본 방식으로 다듬었습니다.</span>
    </div>
  );
}

function QuestionList({ questions, mode, summary }) {
  const normalizedQuestions = normalizeMessageQuestions(questions);
  if (!normalizedQuestions.length) return null;
  const isAsk = mode === "ask";

  return (
    <div className="ask-message">
      <strong>{isAsk ? "답변이 필요한 정보" : "더 정확하게 개선하려면 아래 질문에 답해보세요."}</strong>
      {summary && !isAsk && <p>{summary}</p>}
      <ol>
        {normalizedQuestions.map((item, index) => (
          <li className={item.importance === "required" ? "required" : "recommended"} key={`${item.field || "question"}-${index}`}>
            <span>{item.question}</span>
            <em>{item.importance === "required" ? "필수 정보" : "선택 정보"}</em>
            {item.reason && <small>{item.reason}</small>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function isUtilityOnlyPrompt(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  return [
    "관련 프롬프트 기법 근거를 찾지 못했습니다",
    "관련 기법 근거 없이",
    "개선안을 만들 수 없",
    "확인이 필요",
  ].some((fragment) => value.includes(fragment));
}

function isAskOnlyResponse(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (isUtilityOnlyPrompt(value)) return true;
  return [
    /확인이\s*필요/i,
    /답변이\s*필요/i,
    /추가\s*정보가\s*필요/i,
    /정보를\s*보완해\s*주세요/i,
    /개선안을?\s*만들\s*수\s*없/i,
    /만들\s*수\s*없어/i,
    /아래\s*정보를\s*알려주시면/i,
    /어떤\s*주제/i,
    /무엇에\s*대한\s*글/i,
  ].some((pattern) => pattern.test(value));
}
