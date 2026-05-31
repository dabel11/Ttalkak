package com.ttalkak.common.ratelimit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimitService {

    @Value("${rate-limit.improve.anonymous-max-requests:5}")
    private int maxRequests;

    @Value("${rate-limit.improve.window-hours:24}")
    private int windowHours;

    private final ConcurrentHashMap<String, RateLimitEntry> store = new ConcurrentHashMap<>();

    public boolean isAllowed(String ip) {
        long now = Instant.now().getEpochSecond();
        long windowSeconds = windowHours * 3600L;

        store.compute(ip, (key, entry) -> {
            if (entry == null || now - entry.windowStart >= windowSeconds) {
                return new RateLimitEntry(now, 1);
            }
            entry.count++;
            return entry;
        });

        return store.get(ip).count <= maxRequests;
    }

    public int getRemainingRequests(String ip) {
        RateLimitEntry entry = store.get(ip);
        if (entry == null) return maxRequests;
        long now = Instant.now().getEpochSecond();
        long windowSeconds = windowHours * 3600L;
        if (now - entry.windowStart >= windowSeconds) return maxRequests;
        return Math.max(0, maxRequests - entry.count);
    }

    private static class RateLimitEntry {
        long windowStart;
        int count;

        RateLimitEntry(long windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }
}
