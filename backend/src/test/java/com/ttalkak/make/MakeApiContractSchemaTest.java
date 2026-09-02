package com.ttalkak.make;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MakeApiContractSchemaTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void generatedConstantsMatchTheSharedSchema() throws Exception {
        Path schemaPath = Path.of("..", "shared", "make-api.schema.json").normalize();
        assertTrue(Files.isRegularFile(schemaPath), "shared Make API schema must be available");

        JsonNode schema = objectMapper.readTree(schemaPath.toFile());
        JsonNode contract = schema.path("x-ttalkak-contract");

        assertEquals(MakeApiContract.REQUEST_ID_MAX_LENGTH, contract.path("requestIdMaxLength").asInt());
        assertEquals(MakeApiContract.IMPROVE_PATH, contract.path("paths").path("improve").asText());
        assertEquals(MakeApiContract.THREADS_PATH, contract.path("paths").path("threads").asText());
        assertEquals(MakeApiContract.THREAD_PATH, contract.path("paths").path("thread").asText());
        assertEquals(MakeApiContract.REQUEST_ID_INVALID, contract.path("errorCodes").path("requestIdInvalid").asText());
        assertEquals(MakeApiContract.REQUEST_ID_REUSED, contract.path("errorCodes").path("requestIdReused").asText());
        assertEquals(MakeApiContract.THREAD_CONCURRENTLY_UPDATED, contract.path("errorCodes").path("threadConcurrentlyUpdated").asText());
    }
}
