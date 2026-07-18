package com.ttalkak.prompt;

import com.ttalkak.community.Comment;
import com.ttalkak.community.CommentRepository;
import com.ttalkak.community.Report;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Component
public class SampleDataLoader implements CommandLineRunner {

    private static final String NICK_COPY_MAKER = "\uce74\ud53c\uba54\uc774\ucee4";
    private static final String NICK_TAG_GENIE = "\ud0dc\uadf8\uc9c0\ub2c8";
    private static final String NICK_DEV_HELPER = "\uac1c\ubc1c\ub3c4\uc6b0\ubbf8";
    private static final String NICK_REPORTER = "\uc0d8\ud50c\uc2e0\uace0\uc790";

    private static final String SAMPLE_COMMENT_TEXT =
            "\uc608\uc2dc\uac00 \uad6c\uccb4\uc801\uc774\ub77c \uad00\ub9ac\uc790 \uae30\ub2a5\uc744 \ud14c\uc2a4\ud2b8\ud558\uae30 \uc88b\ub124\uc694.";
    private static final String SAMPLE_REPLY_TEXT =
            "\ub9de\uc544\uc694. \uc774 \ub313\uae00\uacfc \uc791\uc131\uc790\ub3c4 \uc2e4\uc81c \ud68c\uc6d0 ID\ub85c \uc5f0\uacb0\ub429\ub2c8\ub2e4.";
    private static final String SAMPLE_PROMPT_REPORT_REASON =
            "\uad00\ub9ac\uc790 \uc2e0\uace0 \ubc0f \ud68c\uc6d0 \ucc28\ub2e8 \uae30\ub2a5 \ud655\uc778\uc6a9 \uc0d8\ud50c \uc2e0\uace0\uc785\ub2c8\ub2e4.";
    private static final String SAMPLE_COMMENT_REPORT_REASON =
            "\uad00\ub9ac\uc790 \ub313\uae00 \uc2e0\uace0 \ubc0f \ud68c\uc6d0 \ucc28\ub2e8 \uae30\ub2a5 \ud655\uc778\uc6a9 \uc0d8\ud50c \uc2e0\uace0\uc785\ub2c8\ub2e4.";

    private final PromptRepository promptRepository;
    private final TagRepository tagRepository;
    private final MemberRepository memberRepository;
    private final CommentRepository commentRepository;
    private final ReportRepository reportRepository;
    private final PasswordEncoder passwordEncoder;

    public SampleDataLoader(
            PromptRepository promptRepository,
            TagRepository tagRepository,
            MemberRepository memberRepository,
            CommentRepository commentRepository,
            ReportRepository reportRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.promptRepository = promptRepository;
        this.tagRepository = tagRepository;
        this.memberRepository = memberRepository;
        this.commentRepository = commentRepository;
        this.reportRepository = reportRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        Map<String, Member> sampleMembers = new LinkedHashMap<>();
        sampleMembers.put(
                NICK_COPY_MAKER,
                getOrCreateSampleMember("sample-copy-maker", NICK_COPY_MAKER)
        );
        sampleMembers.put(
                NICK_TAG_GENIE,
                getOrCreateSampleMember("sample-tag-genie", NICK_TAG_GENIE)
        );
        sampleMembers.put(
                NICK_DEV_HELPER,
                getOrCreateSampleMember("sample-dev-helper", NICK_DEV_HELPER)
        );
        sampleMembers.put(
                NICK_REPORTER,
                getOrCreateSampleMember("sample-reporter", NICK_REPORTER)
        );

        backfillPromptAuthors(sampleMembers);

        PromptPost captionPrompt = ensurePrompt(
                "\uc804\ubb38\uc801\uc778 \uc778\uc2a4\ud0c0\uadf8\ub7a8 \ucea1\uc158 \uc791\uc131",
                "\ub2f9\uc2e0\uc740 \uc804\ubb38\uc801\uc778 \ucf58\ud150\uce20 \ub9c8\ucf00\ud130\uc785\ub2c8\ub2e4. \ube0c\ub79c\ub4dc\uc758 \ud575\uc2ec \uba54\uc2dc\uc9c0\ub97c \uc0b4\ub824 \uc778\uc2a4\ud0c0\uadf8\ub7a8 \ucea1\uc158\uc744 \uc791\uc131\ud574\uc8fc\uc138\uc694. \ud574\uc2dc\ud0dc\uadf8\ub3c4 5\uac1c \ud3ec\ud568\ud574\uc8fc\uc138\uc694.",
                List.of("\ub9c8\ucf00\ud305", "\uc778\uc2a4\ud0c0\uadf8\ub7a8", "\ucf58\ud150\uce20"),
                sampleMembers.get(NICK_COPY_MAKER)
        );

        ensurePrompt(
                "\uae00\uc4f0\uae30 \ucca8\uc0ad \ud504\ub86c\ud504\ud2b8",
                "\uae00\uc758 \ud750\ub984, \ubb38\ubc95, \uac00\ub3c5\uc131\uc744 \ubaa8\ub450 \uace0\ub824\ud574\uc11c \uac1c\uc120\uc548\uc744 \uc81c\uc548\ud574\uc8fc\uc138\uc694.",
                List.of("\ucca8\uc0ad", "\uae00\uc4f0\uae30", "\ud3b8\uc9d1"),
                sampleMembers.get(NICK_COPY_MAKER)
        );

        ensurePrompt(
                "SEO \ube14\ub85c\uadf8 \ud3ec\uc2a4\ud305",
                "\uac80\uc0c9\uc5d4\uc9c4 \uc0c1\uc704 \ub178\ucd9c\uc744 \uc704\ud55c \ud0a4\uc6cc\ub4dc \uc911\uc2ec\uc758 \ube14\ub85c\uadf8 \uae00\uc744 \uc791\uc131\ud574\uc8fc\uc138\uc694. \uc81c\ubaa9, \uc18c\uc81c\ubaa9, \ubcf8\ubb38\uc744 \uad6c\uc870\ud654\ud574\uc8fc\uc138\uc694.",
                List.of("SEO", "\ube14\ub85c\uadf8", "\uac80\uc0c9\ucd5c\uc801\ud654"),
                sampleMembers.get(NICK_TAG_GENIE)
        );

        ensurePrompt(
                "\ucf54\ub529 \uc9c8\ubb38 \uac1c\uc120",
                "\ub9c9\uc5f0\ud55c \ucf54\ub529 \uc9c8\ubb38\uc744 \uc7ac\ud604 \ub2e8\uacc4, \uae30\ub300 \uacb0\uacfc, \uc2e4\uc81c \uacb0\uacfc, \uc5d0\ub7ec \ub85c\uadf8, \ud658\uacbd \uc815\ubcf4\uac00 \ub4e4\uc5b4\uac04 \uc9c8\ubb38\uc73c\ub85c \ubc14\uafd4\uc8fc\uc138\uc694.",
                List.of("\ucf54\ub529", "\uc9c8\ubb38", "\uac1c\ubc1c"),
                sampleMembers.get(NICK_DEV_HELPER)
        );

        backfillCommentAuthors(sampleMembers);

        Comment sampleComment = ensureRootComment(
                captionPrompt,
                sampleMembers.get(NICK_TAG_GENIE),
                SAMPLE_COMMENT_TEXT
        );

        ensureReply(
                captionPrompt,
                sampleComment,
                sampleMembers.get(NICK_DEV_HELPER),
                SAMPLE_REPLY_TEXT
        );

        Member sampleReporter = sampleMembers.get(NICK_REPORTER);

        ensureReport(
                "prompt",
                captionPrompt.getId(),
                sampleReporter.getId(),
                SAMPLE_PROMPT_REPORT_REASON
        );

        ensureReport(
                "comment",
                sampleComment.getId(),
                sampleReporter.getId(),
                SAMPLE_COMMENT_REPORT_REASON
        );
    }

    private Member getOrCreateSampleMember(
            String userId,
            String nickname
    ) {
        return memberRepository.findByUserId(userId)
                .orElseGet(() -> memberRepository.save(
                        new Member(
                                userId,
                                passwordEncoder.encode(
                                        UUID.randomUUID().toString()
                                ),
                                nickname,
                                nickname,
                                null,
                                null,
                                null
                        )
                ));
    }

    private void backfillPromptAuthors(Map<String, Member> sampleMembers) {
        for (PromptPost prompt : promptRepository.findAll()) {
            if (prompt.getAuthorId() != null) {
                continue;
            }
            Member member = sampleMembers.get(prompt.getAuthorNickname());
            if (member == null) {
                continue;
            }
            prompt.linkAuthor(member.getId(), member.getNickname());
            promptRepository.save(prompt);
        }
    }

    private void backfillCommentAuthors(Map<String, Member> sampleMembers) {
        for (Comment comment : commentRepository.findAll()) {
            if (comment.getAuthorId() != null) {
                continue;
            }
            Member member = sampleMembers.get(comment.getAuthorNickname());
            if (member == null) {
                continue;
            }
            comment.linkAuthor(member.getId(), member.getNickname());
            commentRepository.save(comment);
        }
    }

    private PromptPost ensurePrompt(
            String title,
            String text,
            List<String> tags,
            Member author
    ) {
        PromptPost existing = promptRepository.findAll().stream()
                .filter(prompt -> title.equals(prompt.getTitle()))
                .filter(prompt -> author.getNickname().equals(
                        prompt.getAuthorNickname()
                ))
                .findFirst()
                .orElse(null);

        if (existing != null) {
            if (existing.getAuthorId() == null) {
                existing.linkAuthor(author.getId(), author.getNickname());
                promptRepository.save(existing);
            }
            return existing;
        }

        PromptPost prompt = new PromptPost(
                author.getId(),
                author.getNickname(),
                title,
                text,
                PromptMapper.joinTags(tags),
                true
        );
        promptRepository.save(prompt);

        for (String raw : tags) {
            String name = Tag.normalize(raw);
            Tag tag = tagRepository.findByName(name)
                    .orElseGet(() -> new Tag(name));
            tag.increaseUseCount();
            tagRepository.save(tag);
        }

        return prompt;
    }

    private Comment ensureRootComment(
            PromptPost prompt,
            Member author,
            String text
    ) {
        Comment existing = commentRepository
                .findByPromptIdAndParentIdIsNullOrderByLikesDescCreatedAtAsc(
                        prompt.getId()
                )
                .stream()
                .filter(comment -> text.equals(comment.getText()))
                .filter(comment -> author.getNickname().equals(
                        comment.getAuthorNickname()
                ))
                .findFirst()
                .orElse(null);

        if (existing != null) {
            if (existing.getAuthorId() == null) {
                existing.linkAuthor(author.getId(), author.getNickname());
                commentRepository.save(existing);
            }
            return existing;
        }

        Comment comment = commentRepository.save(
                new Comment(
                        prompt.getId(),
                        null,
                        author.getId(),
                        author.getNickname(),
                        text
                )
        );
        prompt.increaseComments();
        promptRepository.save(prompt);
        return comment;
    }

    private Comment ensureReply(
            PromptPost prompt,
            Comment parent,
            Member author,
            String text
    ) {
        Comment existing = commentRepository
                .findByParentIdOrderByLikesDescCreatedAtAsc(parent.getId())
                .stream()
                .filter(comment -> text.equals(comment.getText()))
                .filter(comment -> author.getNickname().equals(
                        comment.getAuthorNickname()
                ))
                .findFirst()
                .orElse(null);

        if (existing != null) {
            if (existing.getAuthorId() == null) {
                existing.linkAuthor(author.getId(), author.getNickname());
                commentRepository.save(existing);
            }
            return existing;
        }

        Comment reply = commentRepository.save(
                new Comment(
                        prompt.getId(),
                        parent.getId(),
                        author.getId(),
                        author.getNickname(),
                        text
                )
        );
        prompt.increaseComments();
        promptRepository.save(prompt);
        return reply;
    }

    private void ensureReport(
            String targetType,
            Long targetId,
            Long reporterId,
            String reason
    ) {
        Report existing = reportRepository.findAll().stream()
                .filter(report ->
                        targetType.equalsIgnoreCase(report.getTargetType())
                                && Objects.equals(
                                        targetId,
                                        report.getTargetId()
                                )
                                && reason.equals(report.getReason())
                )
                .findFirst()
                .orElse(null);

        if (existing != null) {
            if (existing.getReporterId() == null) {
                existing.linkReporter(reporterId);
                reportRepository.save(existing);
            }
            return;
        }

        reportRepository.save(
                new Report(targetType, targetId, reporterId, reason)
        );
    }
}
