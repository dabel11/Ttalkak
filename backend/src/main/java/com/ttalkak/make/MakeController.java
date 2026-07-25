package com.ttalkak.make;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/make")
public class MakeController {
    private final MakeThreadRepository threadRepository;
    private final MakeFolderRepository folderRepository;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public MakeController(MakeThreadRepository threadRepository,
                          MakeFolderRepository folderRepository,
                          AuthService authService,
                          ObjectMapper objectMapper) {
        this.threadRepository = threadRepository;
        this.folderRepository = folderRepository;
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/threads")
    public Map<String, Object> threads(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        Long memberId = requireMemberId(authorization);

        List<Map<String, Object>> items =
                threadRepository
                        .findByMemberIdOrderByUpdatedAtDesc(memberId)
                        .stream()
                        .map(this::threadMap)
                        .toList();

        return pageResponse(items, page, size, pageSize);
    }

    @GetMapping("/threads/{id}")
    public Map<String, Object> threadDetail(
            @PathVariable String id,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long memberId = requireMemberId(authorization);
        Long threadId = parseNumericId(id, "thread id");

        MakeThread thread = threadRepository
                .findByIdAndMemberId(threadId, memberId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "THREAD_NOT_FOUND",
                        "대화를 찾을 수 없습니다."
                ));

        return threadMap(thread);
    }

    @PostMapping("/threads")
    public Map<String, Object> saveThread(
            @RequestBody SaveThreadRequest request,
            @RequestHeader(value = "Authorization", required = false)
            String authorization
    ) {
        Long memberId = requireMemberId(authorization);
        Long requestedId =
                request.id() != null ? request.id() : request.threadId();

        if (requestedId != null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "THREAD_ID_NOT_ALLOWED",
                    "새 대화 생성 요청에는 threadId를 지정할 수 없습니다."
            );
        }

        String title = normalizeTitle(request.title());
        String messagesJson = toJson(request.messages());
        Long folderId = normalizeFolderId(request.folderId(), memberId);

        MakeThread thread =
                new MakeThread(memberId, title, messagesJson, folderId);

        return threadMap(threadRepository.save(thread));
    }

    @PatchMapping("/threads/{id}")
    public Map<String, Object> updateThread(
            @PathVariable String id,
            @RequestBody SaveThreadRequest request,
            @RequestHeader(value = "Authorization", required = false)
            String authorization
    ) {
        Long memberId = requireMemberId(authorization);
        Long threadId = parseNumericId(id, "thread id");

        MakeThread thread = threadRepository
                .findByIdAndMemberId(threadId, memberId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "THREAD_NOT_FOUND",
                        "대화 스레드를 찾을 수 없습니다."
                ));

        String title = request.title() == null
                ? thread.getTitle()
                : normalizeTitle(request.title());

        thread.update(
                title,
                thread.getMessagesJson(),
                thread.getFolderId()
        );

        return threadMap(threadRepository.save(thread));
    }

    @DeleteMapping("/threads/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteThread(
            @PathVariable String id,
            @RequestHeader(value = "Authorization", required = false)
            String authorization
    ) {
        Long memberId = requireMemberId(authorization);
        Long threadId = parseNumericId(id, "thread id");

        MakeThread thread =
                threadRepository
                        .findByIdAndMemberId(threadId, memberId)
                        .orElseThrow(() ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "대화를 찾을 수 없습니다."
                                )
                        );

        threadRepository.delete(thread);
    }

    @GetMapping("/folders")
    public Map<String, Object> folders(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        Long memberId = requireMemberId(authorization);

        List<Map<String, Object>> items =
                folderRepository
                        .findByMemberIdOrderByCreatedAtDesc(memberId)
                        .stream()
                        .map(this::folderMap)
                        .toList();

        return pageResponse(items, page, size, pageSize);
    }

    @PostMapping("/folders")
    public ResponseEntity<?> createFolder(@RequestBody FolderRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        validateFolderName(request.name());
        if (folderRepository.countByMemberId(memberId) >= 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "폴더는 최대 5개까지 만들 수 있습니다.");
        }
        MakeFolder folder = folderRepository.save(new MakeFolder(memberId, request.name().trim()));
        return ResponseEntity.ok(folderMap(folder));
    }

    @PatchMapping("/folders/{id}")
    public ResponseEntity<?> updateFolder(@PathVariable Long id,
                                          @RequestBody FolderRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        validateFolderName(request.name());
        MakeFolder folder = folderRepository.findByIdAndMemberId(id, memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "폴더를 찾을 수 없습니다."));
        folder.updateName(request.name().trim());
        folderRepository.save(folder);
        return ResponseEntity.ok(folderMap(folder));
    }

    @DeleteMapping("/folders/{id}")
    public Map<String, Object> deleteFolder(@PathVariable Long id,
                                            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        MakeFolder folder = folderRepository.findByIdAndMemberId(id, memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "폴더를 찾을 수 없습니다."));
        threadRepository.findByMemberIdOrderByUpdatedAtDesc(memberId).stream()
                .filter(thread -> id.equals(thread.getFolderId()))
                .forEach(thread -> {
                    thread.moveFolder(null);
                    threadRepository.save(thread);
                });
        folderRepository.delete(folder);
        return Map.of("deleted", true, "id", id);
    }

    @PatchMapping("/threads/{id}/folder")
    public ResponseEntity<?> moveThread(@PathVariable String id,
                                        @RequestBody MoveFolderRequest request,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Long threadId = parseNumericId(id, "thread id");
        MakeThread thread = threadRepository.findByIdAndMemberId(threadId, memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "대화 스레드를 찾을 수 없습니다."));
        Long folderId = normalizeFolderId(request.folderId(), memberId);
        thread.moveFolder(folderId);
        threadRepository.save(thread);
        return ResponseEntity.ok(threadMap(thread));
    }

    private Map<String, Object> pageResponse(
            List<Map<String, Object>> allItems,
            int page,
            Integer size,
            Integer pageSize
    ) {
        int resolvedSize = size != null
                ? size
                : (pageSize != null ? pageSize : 16);

        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(resolvedSize, 1), 100);

        int total = allItems.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<Map<String, Object>> items =
                allItems.subList(from, to);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0
                        ? 0
                        : (int) Math.ceil(
                                (double) total / safeSize
                        )
        );

        return body;
    }

    private Map<String, Object> threadMap(MakeThread thread) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", thread.getId());
        body.put("threadId", thread.getId());
        body.put("folderId", thread.getFolderId());
        body.put("title", thread.getTitle());
        body.put("messages", fromJson(thread.getMessagesJson()));
        body.put("createdAt", thread.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        body.put("updatedAt", thread.getUpdatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        return body;
    }

    private Map<String, Object> folderMap(MakeFolder folder) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", folder.getId());
        body.put("name", folder.getName());
        body.put("createdAt", folder.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        return body;
    }

    private Long requireMemberId(String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "LOGIN_REQUIRED",
                    "로그인이 필요합니다."
            );
        }
        return memberId;
    }

    private String normalizeTitle(String title) {
        return title == null || title.isBlank() ? "새 프롬프트 개선 대화" : title.trim();
    }

    private void validateFolderName(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "폴더 이름을 입력해주세요.");
        }
    }

    private Long normalizeFolderId(Long folderId, Long memberId) {
        if (folderId == null) return null;
        folderRepository.findByIdAndMemberId(folderId, memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "본인 폴더만 사용할 수 있습니다."));
        return folderId;
    }

    private Long parseNumericId(String rawId, String fieldName) {
        try {
            return Long.parseLong(rawId);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "는 백엔드에 저장된 숫자 id여야 합니다. 임시 id는 먼저 저장 후 사용해주세요.");
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? List.of() : value);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "messages를 JSON으로 저장할 수 없습니다.");
        }
    }

    private List<Map<String, Object>> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }

        try {
            return objectMapper.readValue(
                    json,
                    new TypeReference<List<Map<String, Object>>>() {}
            );
        } catch (Exception e) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "THREAD_DATA_CORRUPTED",
                    "대화 데이터가 손상되었습니다."
            );
        }
    }

    private int resolvePageSize(
            Integer size,
            Integer pageSize
    ) {
        return size != null
                ? size
                : (pageSize != null ? pageSize : 16);
    }

    private <T> Map<String, Object> pageResponse(
            List<T> allItems,
            int page,
            int size
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        int total = allItems.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<T> items = allItems.subList(from, to);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0
                        ? 0
                        : (int) Math.ceil(
                                (double) total / safeSize
                        )
        );

        return body;
    }

    public record SaveThreadRequest(Long id, Long threadId, String title, Object messages, Long folderId) {}
    public record FolderRequest(String name) {}
    public record MoveFolderRequest(Long folderId) {}
}
