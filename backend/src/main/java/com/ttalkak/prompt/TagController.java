package com.ttalkak.prompt;

import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
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
    public List<Map<String, Object>> popular(@RequestParam(defaultValue = "8") int limit) {
        return tagRepository.findTop20ByOrderByUseCountDesc().stream()
                .limit(limit)
                .map(this::toMap)
                .toList();
    }

    @GetMapping
    public List<Map<String, Object>> search(@RequestParam(defaultValue = "") String query,
                                            @RequestParam(defaultValue = "8") int limit) {
        String normalized = Tag.normalize(query);
        return tagRepository.findByNameContainingIgnoreCaseOrderByUseCountDesc(normalized).stream()
                .limit(limit)
                .map(this::toMap)
                .toList();
    }

    @PostMapping("/proposals")
    public Map<String, Object> propose(@RequestBody TagProposalRequest request) {
        String name = Tag.normalize(request.name());
        Tag tag = tagRepository.findByName(name).orElseGet(() -> tagRepository.save(new Tag(name)));
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

    public record TagProposalRequest(String name) {}
}
