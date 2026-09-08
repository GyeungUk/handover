package com.globalaffairs.handover.ai;

import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.PropertyField;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import org.springframework.stereotype.Component;

/**
 * The shared plumbing every model-backed route uses. Port of {@code app/ai-shared.ts}.
 *
 * <p>Models return plain text only; the HTML the editor renders is built here, fully escaped.
 */
@Component
public class AiSupport {

    private static final List<String> IMPORT_PARAGRAPH_ORDER = List.of(
            "업무 개요", "대상·일정", "처리 절차", "현재 상태", "후속 조치", "인계 포인트", "주의사항");

    private static final Map<String, String> IMPORT_PARAGRAPH_ALIASES = Map.ofEntries(
            Map.entry("업무개요", "업무 개요"),
            Map.entry("대상 및 일정", "대상·일정"),
            Map.entry("대상/일정", "대상·일정"),
            Map.entry("진행 상황", "현재 상태"),
            Map.entry("진행상황", "현재 상태"),
            Map.entry("준비 자료", "처리 절차"),
            Map.entry("준비사항", "처리 절차"),
            Map.entry("준비 사항", "처리 절차"),
            Map.entry("협업 절차", "처리 절차"),
            Map.entry("인정 기준", "주의사항"));

    private final HandoverSchema schema;

    public AiSupport(HandoverSchema schema) {
        this.schema = schema;
    }

    public static String escapeHtml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Collapses whitespace so a model quote can be matched against the text it was drawn from. */
    public static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    /**
     * The source's own wording for a quote a model returned, or empty when the source lacks it.
     *
     * <p>Every route drops an item whose quote it cannot find, because prose nothing on the page
     * supports reads as confidently as prose it does. The check was exact, and a model copying out
     * of a converted document reproduces the characters far more reliably than the spaces between
     * them — Korean office text writes "2 주 내 복귀" and a model writing prose closes the gap. An
     * item was being thrown away for that alone. Matching without the spaces recovers it, and what
     * comes back is the substring as the source writes it, so the editor still shows the page's own
     * words rather than the model's spacing of them.
     */
    public static String groundedQuote(String quote, String normalizedSource) {
        String needle = normalize(quote);
        if (needle.isEmpty() || normalizedSource == null || normalizedSource.isEmpty()) {
            return "";
        }
        if (normalizedSource.contains(needle)) {
            return needle;
        }
        String spacingMatch = quoteIgnoring(needle, normalizedSource, character -> character == ' ');
        if (!spacingMatch.isEmpty()) {
            return spacingMatch;
        }
        /* A converter and a model often disagree only about decorative punctuation: (영문),
           입사일/오리엔테이션, or ※. Words and their order still have to be identical. */
        return quoteIgnoring(needle, normalizedSource, AiSupport::isQuoteFormatting);
    }

    private static String quoteIgnoring(
            String needle, String source, java.util.function.IntPredicate ignored) {
        StringBuilder squeezedNeedle = new StringBuilder(needle.length());
        for (int at = 0; at < needle.length(); at++) {
            if (!ignored.test(needle.charAt(at))) {
                squeezedNeedle.append(needle.charAt(at));
            }
        }
        if (squeezedNeedle.isEmpty()) {
            return "";
        }
        StringBuilder squeezed = new StringBuilder(source.length());
        int[] origin = new int[source.length()];
        for (int at = 0; at < source.length(); at++) {
            if (ignored.test(source.charAt(at))) {
                continue;
            }
            origin[squeezed.length()] = at;
            squeezed.append(source.charAt(at));
        }
        int found = squeezed.indexOf(squeezedNeedle.toString());
        if (found < 0) {
            return "";
        }
        return source.substring(origin[found], origin[found + squeezedNeedle.length() - 1] + 1);
    }

    private static boolean isQuoteFormatting(int character) {
        return Character.isWhitespace(character)
                || "()[]{}<>/\\|:·・※★*#".indexOf(character) >= 0;
    }

    /**
     * Reject concrete numbers the model introduced even when the prose around them is fluent.
     *
     * <p>The comparison is per digit run, not per punctuated token, and that distinction decides
     * whether whole correct items survive. A source writes a date as {@code 7/22~23} and an
     * academic year as {@code 2027-1학기}; a model rewriting either into ordinary Korean produces
     * {@code 7월 22일} and {@code 2027학년도 1학기}. Matching {@code 7/22} against {@code 7} finds
     * nothing, so an item whose every figure came straight off the page was being dropped as
     * invented — on the interview timetable, the only item the document yields. Splitting both
     * sides into runs keeps the guarantee that matters (every figure the model wrote appears in the
     * source) and stops punishing it for reading a date out loud.
     */
    public static boolean usesOnlyRecordedNumbers(String candidate, String source, Set<String> allowed) {
        Set<String> recorded = new java.util.HashSet<>();
        digitRuns(source, recorded);
        for (String value : allowed == null ? Set.<String>of() : allowed) {
            digitRuns(value, recorded);
        }
        Set<String> used = new java.util.HashSet<>();
        digitRuns(candidate, used);
        return recorded.containsAll(used);
    }

    private static final java.util.regex.Pattern DIGIT_RUN = java.util.regex.Pattern.compile("\\d+");

    /** Every maximal run of digits in the value, with a leading zero dropped ("07" and "7" agree). */
    private static void digitRuns(String value, Set<String> into) {
        java.util.regex.Matcher matcher = DIGIT_RUN.matcher(value == null ? "" : value);
        while (matcher.find()) {
            into.add(matcher.group().replaceFirst("^0+(?=\\d)", ""));
        }
    }

    /**
     * Markers a file converter leaves behind: Markdown headings and emphasis, and the arrows a
     * slide deck uses for sub-points. Korean office prose does not contain these, so their presence
     * in a model's own field means it copied a converted line instead of writing one.
     */
    private static final java.util.regex.Pattern EXTRACTION_MARKUP =
            java.util.regex.Pattern.compile("(?m)(?:^|\\s)#{1,6}(?:\\s|$)|\\*\\*|[►▶]");

    /** True when a field carries converter markup rather than the words a person would write. */
    public static boolean carriesExtractionMarkup(String value) {
        return value != null && EXTRACTION_MARKUP.matcher(value).find();
    }

    /** Removes those markers, keeping the words they wrapped. */
    public static String stripExtractionMarkup(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replaceAll("(?m)(^|\\s)#{1,6}(?=\\s|$)", "$1")
                .replaceAll("\\*\\*([\\s\\S]*?)\\*\\*", "$1")
                .replaceAll("[*`►▶]+", " ")
                .replaceAll("[ \\t]{2,}", " ")
                .trim();
    }

    /**
     * The length of verbatim source a field has to reproduce before it counts as a copy rather than
     * a close paraphrase. A rewritten Korean sentence keeps the facts but not this much of the
     * original word order, while a model that gave up and pasted a slide reproduces far more.
     *
     * <p>Measured rather than guessed: across 242 paragraphs the model wrote from a 45-page
     * orientation deck, the longest run any of them shared with the source was 38 characters. The
     * threshold sits well clear of that, so tightening it further would start costing real items.
     */
    private static final int COPIED_RUN = 90;

    /** True when the candidate reproduces an unbroken {@value #COPIED_RUN}-character run of the source. */
    public static boolean looksCopiedFrom(String candidate, String normalizedSource) {
        String text = normalize(candidate);
        if (text.length() < COPIED_RUN || normalizedSource == null) {
            return false;
        }
        /* Striding rather than testing every offset: a paste is far longer than one window. */
        for (int start = 0; start + COPIED_RUN <= text.length(); start += 16) {
            if (normalizedSource.contains(text.substring(start, start + COPIED_RUN))) {
                return true;
            }
        }
        return normalizedSource.contains(text.substring(text.length() - COPIED_RUN));
    }

    /** The entry body: escaped paragraphs, then the open questions as a list when there are any. */
    public static String detailHtml(List<String> paragraphs, List<String> questions) {
        StringBuilder body = new StringBuilder();
        appendParagraphs(body, paragraphs);
        appendQuestions(body, questions);
        return body.toString();
    }

    /**
     * The body of an imported entry: what the work is for, how it is run, and what to watch.
     *
     * <p>An import that returns prose alone hands the successor a description of a document rather
     * than a job they can pick up. The operation fields carry the parts that make it runnable —
     * the cycle and the deadline, the departments and what each one does, the systems and forms,
     * the order of the steps, what has to be finished first and what this work hands on — and they
     * are written out as their own labelled blocks so none of it dissolves back into a paragraph.
     *
     * <p>Control points get a table because their whole value is in the four columns being told
     * apart: the condition that triggers a check, who performs it, what they do, and the threshold
     * at which it leaves the team. A control written as a sentence reads as an incident; written
     * as a row it reads as the rule it is. Open questions stay last, so
     * {@link #splitOpenQuestions} still finds the boundary between the record and its gaps.
     */
    public static String importDetailHtml(
            List<String> paragraphs,
            com.globalaffairs.handover.ai.dto.ImportResponse.Operation operation,
            List<String> questions,
            int max) {
        /* Display order, each block with what it costs to lose. A card this long is a document
           that recorded a great deal about one duty, not an error, so the body is trimmed by
           dropping whole blocks rather than cut mid-tag into markup the editor cannot store. */
        List<Block> blocks = new ArrayList<>();
        if (operation != null) {
            blocks.add(block(1, body -> {
                if (!operation.purpose().isBlank()) {
                    labelled(body, "업무 목적", operation.purpose());
                }
            }));
        }
        blocks.add(block(1, body -> appendParagraphs(body, paragraphs)));
        if (operation != null) {
            blocks.add(block(2, body -> appendTiming(body, operation.timing())));
            blocks.add(block(4, body -> appendCollaborators(body, operation.collaborators())));
            blocks.add(block(5, body -> appendResources(body, operation.resources())));
            blocks.add(block(3, body -> appendList(body, "실행 절차", operation.steps(), true)));
            blocks.add(block(6, body -> appendList(body, "선행조건", operation.prerequisites(), false)));
            blocks.add(block(6, body -> appendList(body, "후속 업무와 전달물", operation.followUp(), false)));
            blocks.add(block(2, body -> appendControls(body, operation.controls())));
        }
        /* The questions are the record of what the source never said, and the quality route finds
           them by this heading being last. They are never the block that gets dropped. */
        blocks.add(block(0, body -> appendQuestions(body, questions)));

        int total = blocks.stream().mapToInt(one -> one.html().length()).sum();
        for (int priority = 6; priority > 0 && total > max; priority--) {
            for (Block one : blocks) {
                if (one.priority() == priority && !one.html().isEmpty() && total > max) {
                    total -= one.html().length();
                    one.drop();
                }
            }
        }
        StringBuilder body = new StringBuilder();
        blocks.forEach(one -> body.append(one.html()));
        return body.toString();
    }

    /** One labelled section of a card body, and how readily it is given up when the body is too long. */
    private static final class Block {
        private final int priority;
        private String html;

        private Block(int priority, String html) {
            this.priority = priority;
            this.html = html;
        }

        private int priority() {
            return priority;
        }

        private String html() {
            return html;
        }

        private void drop() {
            html = "";
        }
    }

    private static Block block(int priority, java.util.function.Consumer<StringBuilder> render) {
        StringBuilder body = new StringBuilder();
        render.accept(body);
        return new Block(priority, body.toString());
    }

    private static void appendParagraphs(StringBuilder body, List<String> paragraphs) {
        java.util.regex.Pattern labeledParagraph = java.util.regex.Pattern.compile("^\\[([^\\]\\r\\n]{1,30})\\]\\s*(.*)$");
        for (String line : paragraphs) {
            java.util.regex.Matcher labeled = labeledParagraph.matcher(line);
            if (!labeled.matches()) {
                body.append("<p>").append(escapeHtml(line)).append("</p>");
                continue;
            }
            labelled(body, labeled.group(1).trim(), labeled.group(2).trim());
        }
    }

    private static void appendQuestions(StringBuilder body, List<String> questions) {
        if (questions.isEmpty()) {
            return;
        }
        body.append("<p><strong>").append(OPEN_QUESTIONS_HEADING).append("</strong></p><ul>");
        for (String line : questions) {
            body.append("<li>").append(escapeHtml(line)).append("</li>");
        }
        body.append("</ul>");
    }

    /** A bold label and, when there is one, the sentence under it. */
    private static void labelled(StringBuilder body, String label, String detail) {
        body.append("<p><strong>").append(escapeHtml(label)).append("</strong>");
        if (!detail.isEmpty()) {
            body.append("<br>").append(escapeHtml(detail));
        }
        body.append("</p>");
    }

    /** Cycle, trigger and deadline on one line, naming each so a date is never read as the other. */
    private static void appendTiming(
            StringBuilder body, com.globalaffairs.handover.ai.dto.ImportResponse.Timing timing) {
        if (timing == null || timing.isEmpty()) {
            return;
        }
        List<String> parts = new ArrayList<>();
        if (!timing.cycle().isBlank()) {
            parts.add("발생 주기: " + timing.cycle());
        }
        if (!timing.trigger().isBlank()) {
            parts.add("시작 조건: " + timing.trigger());
        }
        if (!timing.deadline().isBlank()) {
            parts.add("마감: " + timing.deadline());
        }
        labelled(body, "주기·시작·마감", String.join(" · ", parts));
    }

    private static void appendCollaborators(
            StringBuilder body,
            List<com.globalaffairs.handover.ai.dto.ImportResponse.Collaborator> collaborators) {
        if (collaborators.isEmpty()) {
            return;
        }
        body.append("<p><strong>협업 부서와 역할</strong></p><ul>");
        for (var collaborator : collaborators) {
            body.append("<li><strong>").append(escapeHtml(collaborator.department())).append("</strong>");
            if (!collaborator.role().isBlank()) {
                body.append(" — ").append(escapeHtml(collaborator.role()));
            }
            body.append("</li>");
        }
        body.append("</ul>");
    }

    private static void appendResources(
            StringBuilder body, com.globalaffairs.handover.ai.dto.ImportResponse.Resources resources) {
        if (resources == null || resources.isEmpty()) {
            return;
        }
        body.append("<p><strong>시스템·문서·산출물</strong></p><ul>");
        resourceLine(body, "시스템", resources.systems());
        resourceLine(body, "입력 문서·서식", resources.documents());
        resourceLine(body, "산출물", resources.outputs());
        body.append("</ul>");
    }

    private static void resourceLine(StringBuilder body, String label, List<String> values) {
        if (values.isEmpty()) {
            return;
        }
        body.append("<li><strong>").append(escapeHtml(label)).append("</strong> — ")
                .append(escapeHtml(String.join(", ", values))).append("</li>");
    }

    private static void appendList(StringBuilder body, String label, List<String> values, boolean ordered) {
        if (values.isEmpty()) {
            return;
        }
        String tag = ordered ? "ol" : "ul";
        body.append("<p><strong>").append(escapeHtml(label)).append("</strong></p><").append(tag).append(">");
        for (String value : values) {
            body.append("<li>").append(escapeHtml(value)).append("</li>");
        }
        body.append("</").append(tag).append(">");
    }

    private static void appendControls(
            StringBuilder body, List<com.globalaffairs.handover.ai.dto.ImportResponse.Control> controls) {
        if (controls.isEmpty()) {
            return;
        }
        body.append("<p><strong>주의사항·통제 포인트</strong></p>")
                .append("<table><thead><tr><th>확인 조건</th><th>담당</th><th>확인·조치</th>")
                .append("<th>보고 기준</th></tr></thead><tbody>");
        for (var control : controls) {
            body.append("<tr>");
            controlCell(body, control.condition());
            controlCell(body, control.owner());
            controlCell(body, control.action());
            controlCell(body, control.escalation());
            body.append("</tr>");
        }
        body.append("</tbody></table>");
    }

    /** An empty cell says the source set no threshold; a guess in its place would invent one. */
    private static void controlCell(StringBuilder body, String value) {
        body.append("<td>").append(value.isBlank() ? "기재 없음" : escapeHtml(value)).append("</td>");
    }

    /**
     * Makes imported model prose obey the editor's seven-label contract.
     *
     * <p>A model can understand the source correctly and still emit {@code [준비 자료]} or repeat
     * {@code [처리 절차]} three times. Those are presentation errors, not reasons to discard factual
     * prose. Known aliases are folded into the contract, repeated labels are joined without losing
     * their content, and the result is rendered in the same order the prompt teaches.
     */
    public static List<String> importParagraphs(List<String> paragraphs) {
        java.util.regex.Pattern labeled = java.util.regex.Pattern.compile("^\\[([^\\]\\r\\n]{1,30})\\]\\s*(.*)$");
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        List<String> unlabeled = new ArrayList<>();

        for (String paragraph : paragraphs == null ? List.<String>of() : paragraphs) {
            java.util.regex.Matcher match = labeled.matcher(paragraph.trim());
            if (!match.matches()) {
                unlabeled.add(paragraph.trim());
                continue;
            }
            String raw = match.group(1).trim();
            String label = IMPORT_PARAGRAPH_ORDER.contains(raw)
                    ? raw
                    : IMPORT_PARAGRAPH_ALIASES.getOrDefault(raw, "인계 포인트");
            String detail = match.group(2).trim();
            if (!detail.isEmpty()) {
                grouped.computeIfAbsent(label, ignored -> new ArrayList<>()).add(detail);
            }
        }

        if (!unlabeled.isEmpty()) {
            String label = grouped.containsKey("업무 개요") ? "인계 포인트" : "업무 개요";
            grouped.computeIfAbsent(label, ignored -> new ArrayList<>()).addAll(unlabeled);
        }

        return IMPORT_PARAGRAPH_ORDER.stream()
                .filter(grouped::containsKey)
                .map(label -> "[" + label + "] " + String.join(" ", grouped.get(label)))
                .toList();
    }

    /** The heading {@link #detailHtml} writes above an entry's open questions. */
    public static final String OPEN_QUESTIONS_HEADING = "확인이 필요한 내용";

    /**
     * An entry body and the author's own open questions, told apart.
     *
     * @param body what the entry actually records
     * @param openQuestions the gaps the author already knew about and wrote down, or empty
     */
    public record EntryText(String body, String openQuestions) {}

    /**
     * Splits an entry body at the open-questions heading.
     *
     * <p>{@link #detailHtml} appends the author's unanswered questions to the body, so by the time
     * an entry comes back for review those questions read as ordinary content. A reviewer then
     * reports the gap the author had already flagged — in one measured run more than half the
     * findings did exactly that, quoting a question rather than a sentence. Separating the two
     * lets each route say which part is which, and keeps a quote check honest: a question is not
     * in the body, so a finding drawn from one no longer passes.
     */
    public static EntryText splitOpenQuestions(String text) {
        String normalized = normalize(text);
        /* The last occurrence, so a body that happens to mention the phrase keeps its own text and
           only the list detailHtml appended at the end is split off. */
        int heading = normalized.lastIndexOf(OPEN_QUESTIONS_HEADING);
        if (heading < 0) {
            return new EntryText(normalized, "");
        }
        return new EntryText(
                normalized.substring(0, heading).trim(),
                normalized.substring(heading + OPEN_QUESTIONS_HEADING.length()).trim());
    }

    /**
     * How much two titles overlap, as the share of two-character sequences they have in common.
     *
     * <p>Used to notice that two parts of one document proposed the same work under slightly
     * different names. Measured on the runs that made it necessary: across four real documents the
     * only genuinely duplicated pair — "파견교환학생 면접시간표 확인" against "…면접시간표 운영",
     * one from each part a split interview timetable produced — scored 0.71, while the closest pair
     * of items that were really different work scored 0.43. {@link #SAME_WORK} sits between them.
     */
    public static double titleOverlap(String left, String right) {
        Set<String> first = bigrams(left);
        Set<String> second = bigrams(right);
        if (first.isEmpty() || second.isEmpty()) {
            return first.equals(second) ? 1 : 0;
        }
        long shared = first.stream().filter(second::contains).count();
        return (double) shared / (first.size() + second.size() - shared);
    }

    /** The overlap at which two proposed titles are treated as the same work. */
    public static final double SAME_WORK = 0.6;

    private static Set<String> bigrams(String value) {
        String text = (value == null ? "" : value).replaceAll("\\s+", "");
        Set<String> grams = new java.util.LinkedHashSet<>();
        for (int at = 0; at + 2 <= text.length(); at++) {
            grams.add(text.substring(at, at + 2));
        }
        return grams;
    }

    /** One key/value the model proposed for an entry's property panel. */
    public record PropertyPair(String key, String value) {}

    /** Drop anything the editor's own property fields would not accept. */
    public Map<String, String> cleanProperties(String category, List<PropertyPair> pairs) {
        return cleanProperties(category, pairs, key -> true);
    }

    public Map<String, String> cleanProperties(String category, List<PropertyPair> pairs, Predicate<String> allowKey) {
        List<PropertyField> fields = schema.propertyFields(category);
        Map<String, String> cleaned = new LinkedHashMap<>();
        if (pairs == null) {
            return cleaned;
        }
        for (PropertyPair pair : pairs) {
            if (pair == null) {
                continue;
            }
            PropertyField field = fields.stream()
                    .filter(item -> item.key().equals(pair.key()))
                    .findFirst()
                    .orElse(null);
            String trimmed = pair.value() == null ? "" : pair.value().trim();
            if (field == null || trimmed.isEmpty() || !allowKey.test(pair.key())) {
                continue;
            }
            if (field.options() != null && !field.options().contains(trimmed)) {
                continue;
            }
            cleaned.put(pair.key(), trimmed);
        }
        return cleaned;
    }

    /**
     * Import fields are facts copied from an uploaded document, unlike draft quality fields that
     * deliberately ask the model for judgement. Option values therefore survive only when the
     * source says that exact option, and prose values stay short enough for the property panel.
     */
    public Map<String, String> cleanImportProperties(
            String category, List<PropertyPair> pairs, String source, Predicate<String> allowKey) {
        Map<String, String> cleaned = cleanProperties(category, pairs, allowKey);
        String recorded = normalize(source);
        List<PropertyField> fields = schema.propertyFields(category);
        cleaned.entrySet().removeIf(entry -> {
            PropertyField field = fields.stream()
                    .filter(candidate -> candidate.key().equals(entry.getKey()))
                    .findFirst()
                    .orElse(null);
            return entry.getValue().length() > 20
                    || (field != null && field.options() != null && !recorded.contains(normalize(entry.getValue())));
        });
        return cleaned;
    }

    /**
     * The property spec handed to the model. Without the label and the editor's own example the model
     * fills a "next owner" field with a sentence, so both travel with every key.
     */
    public Map<String, Object> allowedProperties() {
        return allowedProperties(key -> true);
    }

    public Map<String, Object> allowedProperties(Predicate<String> include) {
        Map<String, Object> allowed = new LinkedHashMap<>();
        for (String category : schema.categories()) {
            List<Map<String, Object>> entries = new ArrayList<>();
            for (PropertyField field : schema.propertyFields(category)) {
                if (!include.test(field.key())) {
                    continue;
                }
                Map<String, Object> described = new LinkedHashMap<>();
                described.put("key", field.key());
                described.put("설명", field.label());
                if (field.options() != null) {
                    described.put("선택지", field.options());
                } else {
                    described.put("예시", field.placeholder());
                }
                entries.add(described);
            }
            allowed.put(category, entries);
        }
        return allowed;
    }

    /** Trim, drop blanks and cap, the way every route treated a model's string list. */
    public static List<String> trimmedLines(List<String> lines, int limit) {
        if (lines == null) {
            return List.of();
        }
        return lines.stream()
                .filter(java.util.Objects::nonNull)
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .limit(limit)
                .toList();
    }

    /** Cap a field without trimming, where the original route sliced the raw value. */
    public static String truncate(String value, int max) {
        String safe = value == null ? "" : value;
        return safe.length() <= max ? safe : safe.substring(0, max);
    }

    /** Trim and cap a single field, tolerating a null the model omitted. */
    public static String clip(String value, int max) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
