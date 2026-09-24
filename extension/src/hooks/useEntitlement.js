// @ts-check
import { useCallback, useEffect, useRef, useState } from "react";
import { requestSubscription } from "../api/subscriptions";
import { isAuthExpiredError } from "../utils/apiErrors";
import { normalizeEntitlement } from "../policies/usage-entitlement.mjs";

const guestEntitlement = () => normalizeEntitlement(null, { fallbackPlan: "GUEST" });
const fallbackEntitlement = (accessToken) => normalizeEntitlement(null, { fallbackPlan: accessToken ? "FREE" : "GUEST" });

export function useEntitlement({ authSession, ragConfig, onAuthExpired }) {
  const accessToken = authSession?.accessToken || "";
  const [entitlement, setEntitlement] = useState(() => fallbackEntitlement(accessToken));
  const onAuthExpiredRef = useRef(onAuthExpired);
  const accessTokenRef = useRef(accessToken);
  const refreshVersionRef = useRef(0);
  useEffect(() => { onAuthExpiredRef.current = onAuthExpired; }, [onAuthExpired]);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  const updateEntitlement = useCallback((payload) => {
    const normalized = normalizeEntitlement(payload, { fallbackPlan: accessToken ? "FREE" : "GUEST" });
    if (normalized.known && accessToken === accessTokenRef.current) {
      refreshVersionRef.current += 1;
      setEntitlement(normalized);
    }
    return normalized;
  }, [accessToken]);

  const refreshEntitlement = useCallback(async () => {
    const refreshVersion = ++refreshVersionRef.current;
    if (!accessToken) {
      setEntitlement(guestEntitlement());
      return;
    }
    try {
      const payload = await requestSubscription(ragConfig, accessToken);
      if (refreshVersion !== refreshVersionRef.current) return;
      updateEntitlement(payload);
    } catch (error) {
      if (refreshVersion !== refreshVersionRef.current) return;
      if (isAuthExpiredError(error)) await onAuthExpiredRef.current?.();
      else if (![404, 501].includes(Number(error?.status || 0))) console.warn("[TTALKAK] 사용량 조회 실패", error);
    }
  }, [accessToken, ragConfig, updateEntitlement]);

  useEffect(() => {
    refreshVersionRef.current += 1;
    setEntitlement(fallbackEntitlement(accessToken));
  }, [accessToken]);
  useEffect(() => { void refreshEntitlement(); }, [refreshEntitlement]);
  useEffect(() => {
    const refreshOnFocus = () => { if (document.visibilityState === "visible") void refreshEntitlement(); };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => document.removeEventListener("visibilitychange", refreshOnFocus);
  }, [refreshEntitlement]);

  return { entitlement, refreshEntitlement, updateEntitlement };
}
