package com.ttalkak.auth;

/** Application requests use the shared database implementation, without a local fallback. */
public interface AuthRequestLimiter {
    boolean allow(String address, String path);

    static int limit(String path) {
        return path.contains("password-reset") || path.contains("recovery") || path.endsWith("find-id") ? 10 : 30;
    }
}
