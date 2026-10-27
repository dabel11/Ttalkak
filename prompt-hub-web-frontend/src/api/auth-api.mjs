export function createAuthApi({ request }) {
    return {
      login(payload) {
        return request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      signup(payload) {
        return request("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      googleConfig() { return request("/api/auth/google/config"); },
      googleLogin(credential, consent = {}) {
        return request("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential, ...consent }),
        });
      },
      /** @param {{ name?: string, email?: string, [key: string]: unknown }} [payload] */
      requestIdRecovery({ name, email } = {}) {
        return request("/api/auth/id-recovery/request", {
          method: "POST",
          body: JSON.stringify({ name, email }),
        });
      },
      requestPasswordReset(payload) {
        return request("/api/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      withdrawAccount(payload, token) {
        return request("/api/auth/withdraw", {
          method: "DELETE",
          token,
          body: JSON.stringify(payload),
        });
      },
      checkUserId(userId) {
        const query = new URLSearchParams({ userId });
        return request(`/api/auth/check-user-id?${query.toString()}`);
      },
      checkNickname(nickname) {
        const query = new URLSearchParams({ nickname });
        return request(`/api/auth/check-nickname?${query.toString()}`);
      },
    };
}
