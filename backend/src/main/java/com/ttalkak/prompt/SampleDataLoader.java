package com.ttalkak.prompt;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class SampleDataLoader implements CommandLineRunner {
    private final PromptRepository promptRepository;
    private final TagRepository tagRepository;

    public SampleDataLoader(PromptRepository promptRepository, TagRepository tagRepository) {
        this.promptRepository = promptRepository;
        this.tagRepository = tagRepository;
    }

    @Override
    public void run(String... args) {
        if (promptRepository.count() > 0) return;
        createSample("전문적인 인스타그램 캡션 작성", "당신은 전문적인 콘텐츠 마케터입니다. 브랜드의 핵심 메시지를 살려 인스타그램 캡션을 작성해주세요. 해시태그도 5개 포함해주세요.", List.of("마케팅", "인스타그램", "콘텐츠"), "카피메이커");
        createSample("글쓰기 첨삭 프롬프트", "글의 흐름, 문법, 가독성을 모두 고려해서 개선안을 제안해주세요.", List.of("첨삭", "글쓰기", "편집"), "카피메이커");
        createSample("SEO 블로그 포스팅", "검색엔진 상위 노출을 위한 키워드 중심의 블로그 글을 작성해주세요. 제목, 소제목, 본문을 구조화해주세요.", List.of("SEO", "블로그", "검색최적화"), "태그지니");
        createSample("코딩 질문 개선", "막연한 코딩 질문을 재현 단계, 기대 결과, 실제 결과, 에러 로그, 환경 정보가 들어간 질문으로 바꿔주세요.", List.of("코딩", "질문", "개발"), "개발도우미");
    }

    private void createSample(String title, String text, List<String> tags, String nickname) {
        PromptPost prompt = new PromptPost(null, nickname, title, text, PromptMapper.joinTags(tags), true);
        promptRepository.save(prompt);
        for (String raw : tags) {
            String name = Tag.normalize(raw);
            Tag tag = tagRepository.findByName(name).orElseGet(() -> new Tag(name));
            tag.increaseUseCount();
            tagRepository.save(tag);
        }
    }
}
