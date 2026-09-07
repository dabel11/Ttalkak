import { MAKE_API_PATHS } from "../utils/make-api-contract.mjs";

function threadPath(threadId) {
  return MAKE_API_PATHS.thread.replace("{threadId}", encodeURIComponent(String(threadId)));
}

export function createMakeApi({ request, unwrapItems, normalizers }) {
    const { normalizeMakeThread, normalizeMakeFolder } = normalizers;

    return {
      getMakeThreads(token) {
        return request(MAKE_API_PATHS.threads, { token }).then((payload) => unwrapItems(payload).map(normalizeMakeThread));
      },
      getMakeThread(threadId, token) {
        return request(threadPath(threadId), { token }).then((payload) => {
          const root = Array.isArray(payload) ? payload[0] : payload;
          return normalizeMakeThread(root?.data || root);
        });
      },
      getMakeFolders(token) {
        return request("/api/make/folders", { token }).then((payload) => unwrapItems(payload).map(normalizeMakeFolder));
      },
      createMakeThread(payload, token) {
        return request(MAKE_API_PATHS.threads, { method: "POST", token, body: JSON.stringify(payload) });
      },
      deleteMakeThread(threadId, token) {
        return request(threadPath(threadId), { method: "DELETE", token });
      },
      createMakeFolder(payload, token) {
        return request("/api/make/folders", { method: "POST", token, body: JSON.stringify(payload) });
      },
      updateMakeFolder(folderId, payload, token) {
        return request(`/api/make/folders/${folderId}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      },
      deleteMakeFolder(folderId, token) {
        return request(`/api/make/folders/${folderId}`, { method: "DELETE", token });
      },
      moveMakeThread(threadId, payload, token) {
        return request(`/api/make/threads/${threadId}/folder`, { method: "PATCH", token, body: JSON.stringify(payload) });
      },
    };
}
