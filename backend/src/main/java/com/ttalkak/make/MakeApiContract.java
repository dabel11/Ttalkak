// GENERATED FILE. Edit shared/make-api.schema.json and run node scripts/build-make-api-contract.cjs.
package com.ttalkak.make;

public final class MakeApiContract {
    public static final int REQUEST_ID_MAX_LENGTH = 128;
    public static final String IMPROVE_PATH = "/api/prompts/improve";
    public static final String THREADS_PATH = "/api/make/threads";
    public static final String THREAD_PATH = "/api/make/threads/{threadId}";
    public static final String REQUEST_ID_INVALID = "REQUEST_ID_INVALID";
    public static final String REQUEST_ID_REUSED = "REQUEST_ID_REUSED";
    public static final String THREAD_CONCURRENTLY_UPDATED = "THREAD_CONCURRENTLY_UPDATED";

    private MakeApiContract() {}
}
