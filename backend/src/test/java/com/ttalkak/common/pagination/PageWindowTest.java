package com.ttalkak.common.pagination;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PageWindowTest {
    @Test
    void firstAndLastPagesKeepNormalApiContract() {
        assertEquals(new PageWindow(1, 16, 0, 16, 3),
                PageWindow.of(1, 16, 39));
        assertEquals(new PageWindow(3, 16, 32, 39, 3),
                PageWindow.of(3, 16, 39));
        assertEquals(new PageWindow(4, 16, 39, 39, 3),
                PageWindow.of(4, 16, 39));
    }

    @Test
    void hugePagesDoNotOverflowOrProduceInvalidSubListIndices() {
        assertEquals(new PageWindow(Integer.MAX_VALUE, 100, 9, 9, 1),
                PageWindow.of(Integer.MAX_VALUE, Integer.MAX_VALUE, 9));
        assertEquals(new PageWindow(Integer.MAX_VALUE, 100, 0, 0, 0),
                PageWindow.of(Integer.MAX_VALUE, Integer.MAX_VALUE, 0));
        assertEquals(new PageWindow(268435456, 16, 3, 3, 1),
                PageWindow.of(268435456, 16, 3));
    }

    @Test
    void negativeAndZeroInputsNormalizeToFirstPageAndOneItem() {
        assertEquals(new PageWindow(1, 1, 0, 1, 3),
                PageWindow.of(Integer.MIN_VALUE, Integer.MIN_VALUE, 3));
        assertEquals(new PageWindow(1, 1, 0, 0, 0),
                PageWindow.of(0, 0, 0));
    }

    @Test
    void largeCountsAndSizeBoundAvoidIntegerOverflow() {
        PageWindow window = PageWindow.of(1, Integer.MAX_VALUE, Integer.MAX_VALUE);
        assertEquals(100, window.size());
        assertEquals(100, window.to());
        assertEquals(21474837, window.totalPages());
        assertEquals(100, PageWindow.normalizeSize(Integer.MAX_VALUE));
        assertThrows(IllegalArgumentException.class, () -> PageWindow.of(1, 5, -1));
    }
}
