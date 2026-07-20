const configuredBaseUrl = import.meta.env.VITE_BACKEND_API_URL?.trim();

export const BACKEND_API_URL = (
  configuredBaseUrl ||
  (import.meta.env.DEV ? "http://localhost:8080" : "")
).replace(/\/+$/, "");

function requireBackendUrl() {
  if (!BACKEND_API_URL) {
    throw new Error("운영 Backend API URL이 설정되지 않았습니다.");
  }

  return BACKEND_API_URL;
}

function getStoredAccessToken() {
  return (
    localStorage.getItem("ttalkak_access_token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    null
  );
}

async function readResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getErrorMessage(data, status) {
  return (
    data?.message ||
    data?.reason ||
    data?.error ||
    `Backend 요청에 실패했습니다. (${status})`
  );
}

export async function improvePrompt({
  prompt,
  category,
  conversationId,
  history,
}) {
  const accessToken = getStoredAccessToken();

  const headers = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    `${requireBackendUrl()}/api/prompts/improve`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        category,
        conversationId:
          typeof conversationId === "number"
            ? conversationId
            : null,
        history,
      }),
    }
  );

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, response.status)
    );
  }

  return data;
}