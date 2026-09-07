// GENERATED FILE. Edit shared/make-api.schema.json and run node scripts/build-make-api-contract.cjs.
export const MAKE_REQUEST_ID_MAX_LENGTH = 128;
export const MAKE_API_PATHS = Object.freeze({
  "improve": "/api/prompts/improve",
  "threads": "/api/make/threads",
  "thread": "/api/make/threads/{threadId}"
});
export const MAKE_ERROR_CODES = Object.freeze({
  "requestIdInvalid": "REQUEST_ID_INVALID",
  "requestIdReused": "REQUEST_ID_REUSED",
  "threadConcurrentlyUpdated": "THREAD_CONCURRENTLY_UPDATED"
});
