package com.ttalkak.prompt;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tags")
public class TagController {

    private final TagRepository tagRepository;

    public TagController(TagRepository tagRepository) {
        this.tagRepository = tagRepository;
    }

    @GetMapping("/popular")
    public List<Map<String, Object>> popular(
            @RequestParam(defaultValue = "8") int limit
    ) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);

        return tagRepository
                .findByStatusOrderByUseCountDesc(
                        TagStatus.APPROVED
                )
                .stream()
                .limit(safeLimit)
                .map(this::toMap)
                .toList();
    }

    @GetMapping
    public List<Map<String, Object>> search(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "8") int limit
    ) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        String normalized = Tag.normalize(query);

        return tagRepository
                .findByNameContainingIgnoreCaseAndStatusOrderByUseCountDesc(
                        normalized,
                        TagStatus.APPROVED
                )
                .stream()
                .limit(safeLimit)
                .map(this::toMap)
                .toList();
    }

    @PostMapping("/proposals")
    public Map<String, Object> propose(
            @RequestBody TagProposalRequest request
    ) {
        String name = Tag.normalize(request.name());

        if (name.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "태그 이름을 입력해 주세요."
            );
        }

        Tag tag = tagRepository.findByName(name)
                .orElseGet(() ->
                        tagRepository.save(Tag.proposal(name))
                );

        return toMap(tag);
    }

    private Map<String, Object> toMap(Tag tag) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", tag.getId());
        map.put("name", tag.getName());
        map.put("useCount", tag.getUseCount());
        map.put("status", tag.getStatus());
        return map;
    }

    public record TagProposalRequest(String name) {
    }
}
