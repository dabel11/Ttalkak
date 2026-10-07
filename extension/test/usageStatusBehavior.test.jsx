import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const usageApi = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../src/api/usage", () => ({ requestUsageStatus: usageApi.request }));

import { useUsageStatus } from "../src/hooks/useUsageStatus";

afterEach(() => {
  vi.clearAllMocks();
});

describe("member usage refresh policy", () => {
  test("coalesces duplicate refreshes while one request is pending", async () => {
    let resolveRequest;
    usageApi.request.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const { result } = renderHook(() => useUsageStatus({
      authSession: { accessToken: "member-token" },
      ragConfig: {},
      onAuthExpired: vi.fn(),
    }));

    await waitFor(() => expect(usageApi.request).toHaveBeenCalledOnce());
    let first;
    let second;
    act(() => {
      first = result.current.refreshUsage();
      second = result.current.refreshUsage({ silent: true });
    });
    expect(first).toBe(second);
    expect(usageApi.request).toHaveBeenCalledOnce();

    await act(async () => resolveRequest({ plan: "FREE", totalTokens: 10 }));
    await waitFor(() => expect(result.current.usageStatus).toBe("ready"));
  });

  test("ignores a late response after logout", async () => {
    let resolveRequest;
    usageApi.request.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const onAuthExpired = vi.fn();
    const { result, rerender } = renderHook(
      ({ authSession }) => useUsageStatus({ authSession, ragConfig: {}, onAuthExpired }),
      { initialProps: { authSession: { accessToken: "member-token" } } },
    );
    await waitFor(() => expect(usageApi.request).toHaveBeenCalledOnce());
    rerender({ authSession: null });
    await act(async () => resolveRequest({ plan: "PRO", totalTokens: 900 }));
    expect(result.current.usage).toBeNull();
    expect(result.current.usageStatus).toBe("idle");
    expect(onAuthExpired).not.toHaveBeenCalled();
  });

  test("turns a usage 401 into the shared authentication-expired flow", async () => {
    usageApi.request.mockRejectedValue(Object.assign(new Error("expired"), { status: 401 }));
    const onAuthExpired = vi.fn(async () => undefined);
    const { result } = renderHook(() => useUsageStatus({
      authSession: { accessToken: "expired-token" },
      ragConfig: {},
      onAuthExpired,
    }));
    await waitFor(() => expect(onAuthExpired).toHaveBeenCalledOnce());
    expect(result.current.usage).toBeNull();
    expect(result.current.usageStatus).toBe("idle");
  });
});
