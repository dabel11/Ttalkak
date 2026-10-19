package com.ttalkak.common.pagination;

/**
 * Normalized 1-based pagination for in-memory API lists.
 *
 * Always use long arithmetic for offsets: Integer.MAX_VALUE-sized page
 * requests must return an empty page rather than wrapping negative and
 * throwing IndexOutOfBoundsException.
 */
public record PageWindow(int page, int size, int from, int to, int totalPages) {
    public static final int MAX_PAGE_SIZE = 100;

    public static int normalizePage(int requested) {
        return Math.max(requested, 1);
    }

    public static int normalizeSize(int requested) {
        return Math.min(Math.max(requested, 1), MAX_PAGE_SIZE);
    }

    public static PageWindow of(int requestedPage, int requestedSize, int count) {
        if (count < 0) throw new IllegalArgumentException("count must not be negative");
        int page = normalizePage(requestedPage);
        int size = normalizeSize(requestedSize);
        long offset = ((long) page - 1L) * size;
        int from = (int) Math.min(offset, (long) count);
        int to = (int) Math.min((long) from + size, (long) count);
        int totalPages = (int) (((long) count + size - 1L) / size);
        return new PageWindow(page, size, from, to, totalPages);
    }
}
