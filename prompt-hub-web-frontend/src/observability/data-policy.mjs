const aggregateEventFields = Object.freeze("area,action,kind,code,status,durationMs,outcome,level,retryable,client,requestCorrelation,timestamp".split(","));

export const OBSERVABILITY_DATA_POLICY = Object.freeze({
  externalCollectionEnabled: false,
  allowedRecordFields: Object.freeze(["name", "message", ...aggregateEventFields]),
  aggregateEventFields,
  prohibitedContent: Object.freeze("prompt,generatedPrompt,history,token,requestId,documentBody,pageContent,clipboard".split(",")),
});
