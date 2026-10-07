import { useCallback, useEffect, useRef, useState } from "react";
import { requestUsageStatus } from "../api/usage";

export function useUsageStatus({ authSession, ragConfig, onAuthExpired }) {
  const accessToken = authSession?.accessToken || "";
  const [usage, setUsage] = useState(null);
  const [status, setStatus] = useState("idle");
  const authExpiredRef = useRef(onAuthExpired);
  const requestVersionRef = useRef(0);
  const inFlightRef = useRef(null);
  const mountedRef = useRef(false);
  const currentAccessTokenRef = useRef(accessToken);
  const expiredTokenRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    authExpiredRef.current = onAuthExpired;
  }, [onAuthExpired]);

  useEffect(() => {
    currentAccessTokenRef.current = accessToken;
    expiredTokenRef.current = "";
    return () => {
      requestVersionRef.current += 1;
      inFlightRef.current = null;
    };
  }, [accessToken]);

  const refreshUsage = useCallback(({ silent = false } = {}) => {
    if (!accessToken) {
      requestVersionRef.current += 1;
      inFlightRef.current = null;
      setUsage(null);
      setStatus("idle");
      return Promise.resolve(null);
    }

    if (inFlightRef.current?.accessToken === accessToken) return inFlightRef.current.promise;

    const requestVersion = ++requestVersionRef.current;
    if (!silent) setStatus("loading");
    const promise = requestUsageStatus(ragConfig, accessToken)
      .then((nextUsage) => {
        if (!mountedRef.current || currentAccessTokenRef.current !== accessToken || requestVersion !== requestVersionRef.current) return null;
        setUsage(nextUsage);
        setStatus("ready");
        return nextUsage;
      })
      .catch(async (error) => {
        if (!mountedRef.current || currentAccessTokenRef.current !== accessToken || requestVersion !== requestVersionRef.current) return null;
        if (Number(error?.status || 0) === 401) {
          setUsage(null);
          setStatus("idle");
          if (expiredTokenRef.current !== accessToken) {
            expiredTokenRef.current = accessToken;
            await authExpiredRef.current?.();
          }
          return null;
        }
        setStatus("error");
        return null;
      })
      .finally(() => {
        if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
      });

    inFlightRef.current = { accessToken, promise };
    return promise;
  }, [accessToken, ragConfig]);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    if (!accessToken) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUsage({ silent: true });
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accessToken, refreshUsage]);

  return { refreshUsage, usage, usageStatus: status };
}
