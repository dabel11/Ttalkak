package com.ttalkak.make;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.auth.AuthService;
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
    public List<Map<String, Object>> threads(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        return threadRepository.findByMemberIdOrderByUpdatedAtDesc(memberId).stream().map(this::threadMap).toList();
    }

    @PostMapping("/threads")
    public Map<String, Object> saveThread(@RequestBody SaveThreadRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        String title = normalizeTitle(request.title());
        String messagesJson = toJson(request.messages());
        Long folderId = normalizeFolderId(request.folderId(), memberId);
        Long requestedId = request.id() != null ? request.id() : request.threadId();

        MakeThread thread;
        if (requestedId != null) {
            thread = threadRepository.findByIdAndMemberId(requestedId, memberId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "대화 스레드를 찾을 수 없습니다."));
            thread.update(title, messagesJson, folderId);
        } else {
            thread = new MakeThread(memberId, title, messagesJson, folderId);
        }

        return threadMap(threadRepository.save(thread));
    }

    @PatchMapping("/threads/{id}")
    public Map<String, Object> updateThread(@PathVariable String id,
                                            @RequestBody SaveThreadRequest request,
                                            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Long threadId = parseNumericId(id, "thread id");
        MakeThread thread = threadRepository.findByIdAndMemberId(threadId, memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "대화 스레드를 찾을 수 없습니다."));
        thread.update(normalizeTitle(request.title()), toJson(request.messages()), normalizeFolderId(request.folderId(), memberId));
        return threadMap(threadRepository.save(thread));
    }

    @GetMapping("/folders")
    public List<Map<String, Object>> folders(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        return folderRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream().map(this::folderMap).toList();
    }

    @PostMapping("/folders")
    public ResponseEntity<?> createFolder(@RequestBody FolderRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        validateFolderName(request.name());
        if (folderRepository.countByMemberId(memberId) >= 5) {
            return ResponseEntity.badRequest().body(Map.of("message", "폴더는 최대 5개까지 만들 수 있습니다."));
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
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
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

    private Object fromJson(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Object>() {});
        } catch (Exception e) {
            return json;
        }
    }

    public record SaveThreadRequest(Long id, Long threadId, String title, Object messages, Long folderId) {}
    public record FolderRequest(String name) {}
    public record MoveFolderRequest(Long folderId) {}
}
