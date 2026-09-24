import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const subscriptionApi = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../src/api/subscriptions", () => ({
  requestSubscription: subscriptionApi.request,
}));

import { useEntitlement } from "../src/hooks/useEntitlement";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("usage entitlement", () => {
  test("shows FREE for a logged-in account while the subscription API is unavailable", async () => {
    subscriptionApi.request.mockRejectedValue({ status: 404 });
    const ragConfig = { backendApiUrl: "http://localhost:8080" };
    const onAuthExpired = vi.fn();
    const { result } = renderHook(() => useEntitlement({
      authSession: { accessToken: "member-token" },
      ragConfig,
      onAuthExpired,
    }));

    expect(result.current.entitlement.plan).toBe("FREE");
    await waitFor(() => expect(subscriptionApi.request).toHaveBeenCalledWith(
      { backendApiUrl: "http://localhost:8080" },
      "member-token",
    ));
    expect(result.current.entitlement.plan).toBe("FREE");
  });

  test("keeps guests on the trial label without requesting account usage", async () => {
    const ragConfig = { backendApiUrl: "http://localhost:8080" };
    const onAuthExpired = vi.fn();
    const { result } = renderHook(() => useEntitlement({
      authSession: null,
      ragConfig,
      onAuthExpired,
    }));

    expect(result.current.entitlement.plan).toBe("GUEST");
    await waitFor(() => expect(subscriptionApi.request).not.toHaveBeenCalled());
  });

  test("ignores a previous account response after logout", async () => {
    let resolveRequest;
    subscriptionApi.request.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const ragConfig = { backendApiUrl: "http://localhost:8080" };
    const onAuthExpired = vi.fn();
    const { result, rerender } = renderHook(({ authSession }) => useEntitlement({ authSession, ragConfig, onAuthExpired }), {
      initialProps: { authSession: { accessToken: "member-token" } },
    });
    await waitFor(() => expect(subscriptionApi.request).toHaveBeenCalledTimes(1));
    rerender({ authSession: null });
    await waitFor(() => expect(result.current.entitlement.plan).toBe("GUEST"));
    await act(async () => resolveRequest({ plan: "PRO", dailyLimit: 100, remainingToday: 99 }));
    expect(result.current.entitlement.plan).toBe("GUEST");
  });

  test("ignores a stale improve callback captured before logout", async () => {
    subscriptionApi.request.mockRejectedValue({ status: 404 });
    const ragConfig = { backendApiUrl: "http://localhost:8080" };
    const onAuthExpired = vi.fn();
    const { result, rerender } = renderHook(({ authSession }) => useEntitlement({ authSession, ragConfig, onAuthExpired }), {
      initialProps: { authSession: { accessToken: "member-token" } },
    });
    const staleUpdate = result.current.updateEntitlement;
    rerender({ authSession: null });
    await waitFor(() => expect(result.current.entitlement.plan).toBe("GUEST"));
    act(() => staleUpdate({ plan: "PRO", dailyLimit: 100, remainingToday: 99 }));
    expect(result.current.entitlement.plan).toBe("GUEST");
  });
});
