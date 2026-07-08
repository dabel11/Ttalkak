package com.ttalkak.make;

import com.ttalkak.auth.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    public MakeController(MakeThreadRepository threadRepository, MakeFolderRepository folderRepository, AuthService authService) {
        this.threadRepository = threadRepository;
        this.folderRepository = folderRepository;
        this.authService = authService;
    }

    @GetMapping("/threads")
    public List<Map<String, Object>> threads(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return List.of();
        return threadRepository.findByMemberIdOrderByUpdatedAtDesc(memberId).stream().map(this::threadMap).toList();
    }

    @PostMapping("/threads")
    public Map<String, Object> saveThread(@RequestBody SaveThreadRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        String title = request.title() == null || request.title().isBlank() ? "새 프롬프트 개선 대화" : request.title();
        MakeThread thread = threadRepository.save(new MakeThread(memberId, title, String.valueOf(request.messages())));
        return threadMap(thread);
    }

    @GetMapping("/folders")
    public List<Map<String, Object>> folders(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return List.of();
        return folderRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream().map(this::folderMap).toList();
    }

    @PostMapping("/folders")
    public ResponseEntity<?> createFolder(@RequestBody FolderRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) memberId = 0L;
        if (folderRepository.countByMemberId(memberId) >= 5) {
            return ResponseEntity.badRequest().body(Map.of("message", "폴더는 최대 5개까지 만들 수 있습니다."));
        }
        MakeFolder folder = folderRepository.save(new MakeFolder(memberId, request.name()));
        return ResponseEntity.ok(folderMap(folder));
    }

    @PatchMapping("/folders/{id}")
    public ResponseEntity<?> updateFolder(@PathVariable Long id, @RequestBody FolderRequest request) {
        MakeFolder folder = folderRepository.findById(id).orElse(null);
        if (folder == null) return ResponseEntity.notFound().build();
        folder.updateName(request.name());
        folderRepository.save(folder);
        return ResponseEntity.ok(folderMap(folder));
    }

    @DeleteMapping("/folders/{id}")
    public Map<String, Object> deleteFolder(@PathVariable Long id) {
        threadRepository.findAll().stream()
                .filter(thread -> id.equals(thread.getFolderId()))
                .forEach(thread -> { thread.moveFolder(null); threadRepository.save(thread); });
        folderRepository.deleteById(id);
        return Map.of("deleted", true, "id", id);
    }

    @PatchMapping("/threads/{id}/folder")
    public ResponseEntity<?> moveThread(@PathVariable Long id, @RequestBody MoveFolderRequest request) {
        MakeThread thread = threadRepository.findById(id).orElse(null);
        if (thread == null) return ResponseEntity.notFound().build();
        thread.moveFolder(request.folderId());
        threadRepository.save(thread);
        return ResponseEntity.ok(threadMap(thread));
    }

    private Map<String, Object> threadMap(MakeThread thread) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", thread.getId());
        body.put("threadId", thread.getId());
        body.put("folderId", thread.getFolderId());
        body.put("title", thread.getTitle());
        body.put("messages", thread.getMessagesJson());
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

    public record SaveThreadRequest(String title, Object messages) {}
    public record FolderRequest(String name) {}
    public record MoveFolderRequest(Long folderId) {}
}
