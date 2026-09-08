package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.ImportResponse;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.web.ApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.springframework.stereotype.Service;

/**
 * Rebuilds an existing handover document into work a successor can actually run.
 *
 * <p>Sorting the upload into the four sections is the smaller half of the job. A document arrives
 * as eight headings and a schedule table, and one card per heading gives the successor a table of
 * contents, not a job: the deadline in the schedule sits in a card of its own, the escalation rule
 * is a clause inside a paragraph, and nothing says which work has to finish before which. So the
 * model is asked for the operation behind each card — cycle, trigger, deadline, the departments
 * and their roles, systems and forms, the steps, what comes before and after, and the control
 * points — and for the phases the cards combine into. This class then checks that answer against
 * the upload rather than trusting it: every unit of the source is addressed, and what no surviving
 * card was built on is reported back as unreflected.
 *
 * <p>Port of {@code app/api/import/route.ts}, since extended past it.
 */
@Service
public class ImportService {

    private static final int SOURCE_MAX = 100000;
    private static final int MAX_ITEMS = 200;

    /**
     * Open questions are the mechanism for everything the source never recorded — where a form
     * lives, who approves, what counts as "repeated". A card that can only ask three of them
     * silently drops the rest, so the cap matches what the schema allows the model to return.
     */
    private static final int MAX_QUESTIONS = 8;

    private static final int MAX_UNMAPPED = 50;
    private static final int TITLE_MAX = 80;
    private static final int FILE_NAME_MAX = 80;
    private static final String DEFAULT_FILE_NAME = "붙여넣은 내용";

    private static final String NOT_CONFIGURED = "자동 분류 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.";

    /**
     * How much of a document one model call is asked to sort, and how many calls a document may
     * cost. Measured, not chosen: a 8,391-character orientation deck sent whole came back after 344
     * seconds — past the 300-second ceiling the page's own hosting puts on a request, so the
     * feature could not finish at all on the file it exists for. The work is nearly all output, so
     * splitting the document splits the time; the parts run together and the slowest one decides.
     * Reading a part also beats skimming the whole: attention that had to cover forty slides now
     * covers ten, which is why the split is by document rather than by a cheaper reasoning setting.
     */
    /*
     * Keep a complete procedure together whenever it fits. At 3,000 characters, the orientation
     * fixture split one 학점전환 procedure across three calls and produced three cards for the same
     * work. The same document takes about 32 seconds as one medium-reasoning call; 9,000 therefore
     * stays well inside the request ceiling while preserving enough context to deduplicate it.
     */
    private static final int CHUNK_TARGET = 9000;

    private static final int MAX_CHUNKS = 8;

    /** How much of the previous part travels with a chunk so a unit split across the seam is still readable. */
    private static final int CHUNK_OVERLAP = 300;

    /** How many parts are in the air at once, so a long document cannot burst past a rate limit. */
    private static final int MAX_PARALLEL = 4;

    /* What the modal tells the author about proposals that never became cards. */
    private static final String SKIPPED_SHAPE = "형식이 불완전한 항목";
    private static final String SKIPPED_UNGROUNDED = "원문에서 근거 구절을 확인하지 못한 항목";
    private static final String SKIPPED_REUSED_QUOTE = "같은 원문 구절을 다시 사용한 항목";
    private static final String SKIPPED_INVENTED_NUMBER = "원문에 없는 숫자가 들어간 항목";
    private static final String SKIPPED_COPIED = "원문을 그대로 옮긴 항목";
    private static final String SKIPPED_REPEATED_TITLE = "같은 업무를 다시 제안한 항목";

    /** Judgement fields belong to generated drafts; an import may only carry recorded facts. */
    private static final Set<String> IMPORT_PROPERTY_KEYS =
            Set.of("cycle", "department", "due", "progress", "response", "owner", "next");

    /* models answer "없음" instead of an empty list, and that should not render as a leftover */
    private static final Set<String> EMPTY_NOTES = Set.of("없음", "해당 없음", "해당없음", "-", "없습니다");

    private final HandoverSchema schema;
    private final OpenAiClient openAiClient;
    private final AiResources resources;
    private final AiSupport support;
    private final JsonStringify json;

    public ImportService(
            HandoverSchema schema,
            OpenAiClient openAiClient,
            AiResources resources,
            AiSupport support,
            JsonStringify json) {
        this.schema = schema;
        this.openAiClient = openAiClient;
        this.resources = resources;
        this.support = support;
        this.json = json;
    }

    public ImportResponse classify(String rawSource, String rawFileName) {
        openAiClient.requireConfigured(NOT_CONFIGURED);

        String source = rawSource == null ? "" : rawSource.trim();
        if (source.length() > SOURCE_MAX) {
            throw new ApiException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                    "정확한 분류를 위해 자료를 100,000자 이하로 나누어 올려 주세요.");
        }
        if (source.length() < 30) {
            throw ApiException.badRequest("읽을 내용이 너무 짧습니다. 자료를 다시 올리거나 내용을 붙여넣어 주세요.");
        }

        String fileName = fileName(rawFileName);
        List<String> chunks = chunk(source);
        List<List<Segment>> segments = segments(chunks);
        List<JsonNode> answers = read(chunks, segments, fileName);

        String haystack = AiSupport.normalize(source);
        List<Segment> everySegment = segments.stream().flatMap(List::stream).toList();
        Set<String> usedQuotes = new java.util.HashSet<>();
        Map<String, List<String>> usedTitles = new LinkedHashMap<>();
        Map<String, Integer> skipped = new LinkedHashMap<>();
        Set<String> covered = new LinkedHashSet<>();
        /* The model's own item ids repeat across parts, so a part number keys them apart; the
           mapping is what lets a work phase still name its cards after the service renumbers them. */
        Map<String, String> publicIds = new LinkedHashMap<>();
        List<ImportResponse.ImportItem> items = new ArrayList<>();

        for (int part = 0; part < answers.size(); part++) {
            for (JsonNode item : answers.get(part).path("items")) {
                if (items.size() >= MAX_ITEMS) {
                    break;
                }
                String category = item.path("category").asText("");
                String title = item.path("title").asText("").trim();
                if (!schema.isCategory(category) || title.isEmpty()) {
                    skip(skipped, SKIPPED_SHAPE);
                    continue;
                }

                List<String> questions = AiSupport.trimmedLines(
                        ModelJson.strings(item.path("questions")), MAX_QUESTIONS);
                List<String> paragraphs = AiSupport.importParagraphs(AiSupport.trimmedLines(
                        ModelJson.strings(item.path("paragraphs")), Integer.MAX_VALUE));
                ImportResponse.Operation operation = operation(item.path("operation"));
                /* Prose and operation are two ways of carrying the same record. A card that has
                   neither says nothing; a card that has only the operation is the normal shape for
                   a procedure whose facts are all cycle, steps and controls. */
                if (paragraphs.isEmpty() && operation == null) {
                    skip(skipped, SKIPPED_SHAPE);
                    continue;
                }
                String quote = AiSupport.groundedQuote(item.path("sourceQuote").asText(""), haystack);
                /* Ungrounded prose can be fluent but false. It never reaches the editor. */
                if (quote.isEmpty()) {
                    skip(skipped, SKIPPED_UNGROUNDED);
                    continue;
                }
                if (usedQuotes.contains(quote)) {
                    skip(skipped, SKIPPED_REUSED_QUOTE);
                    continue;
                }
                /*
                 * Two parts of one document propose the same work under two names; the first is kept.
                 * Within a section, because the prompt now asks for the schedule, the failure and the
                 * unfinished business of one duty as their own items — "상대교 지명 절차 안내" as a
                 * responsibility and "상대교 지명 절차 진행 일정" as a plan are the two halves the
                 * author asked to see separated, and they overlap by exactly the words they share.
                 */
                List<String> sectionTitles = usedTitles.computeIfAbsent(category, ignored -> new ArrayList<>());
                if (sectionTitles.stream().anyMatch(seen -> AiSupport.titleOverlap(seen, title) >= AiSupport.SAME_WORK)) {
                    skip(skipped, SKIPPED_REPEATED_TITLE);
                    continue;
                }
                Map<String, String> properties = support.cleanImportProperties(
                        category, ModelJson.propertyPairs(item.path("properties")), source, IMPORT_PROPERTY_KEYS::contains);
                /* The number check has to see the operation too: an invented escalation threshold
                   ("반복 3회 이상") lands in a control, never in a paragraph. */
                String prose = title + " " + String.join(" ", paragraphs) + " "
                        + String.join(" ", properties.values()) + " " + operationProse(operation);
                if (!AiSupport.usesOnlyRecordedNumbers(prose, haystack, Set.of())) {
                    skip(skipped, SKIPPED_INVENTED_NUMBER);
                    continue;
                }
                /*
                 * The checks above are satisfied trivially by the one answer a model falls back on when
                 * a converted slide deck gives it no prose to rewrite: pasting the source. Such an item
                 * quotes itself and introduces no number, so it passes both and reaches the editor as a
                 * title full of "###". Copied markup and copied runs are rejected here instead.
                 */
                List<String> steps = operation == null ? List.of() : operation.steps();
                if (AiSupport.carriesExtractionMarkup(title)
                        || paragraphs.stream().anyMatch(AiSupport::carriesExtractionMarkup)
                        || paragraphs.stream().anyMatch(line -> AiSupport.looksCopiedFrom(line, haystack))
                        || steps.stream().anyMatch(step -> AiSupport.looksCopiedFrom(step, haystack))) {
                    skip(skipped, SKIPPED_COPIED);
                    continue;
                }

                /* Only accepted items claim evidence and titles. An invalid proposal must not hide
                   a later, valid account of the same fact, including at a chunk boundary. */
                usedQuotes.add(quote);
                sectionTitles.add(title);
                Grounded grounded = ground(item, quote, haystack, everySegment);
                covered.addAll(grounded.covered());
                String id = "import-" + items.size();
                publicIds.put(part + "#" + item.path("id").asText(""), id);
                items.add(new ImportResponse.ImportItem(
                        id,
                        category,
                        AiSupport.clip(AiSupport.stripExtractionMarkup(title), TITLE_MAX),
                        AiSupport.importDetailHtml(
                                paragraphs.stream().map(AiSupport::stripExtractionMarkup).toList(),
                                operation, questions, schema.documentLimits().entryDetail()),
                        properties,
                        questions,
                        quote,
                        "high".equals(item.path("confidence").asText("")) ? "high" : "low",
                        "",
                        operation,
                        grounded.evidence()));
            }
        }

        items.sort(Comparator.comparingInt(item -> schema.categoryOrder(item.category())));

        List<String> warnings = new ArrayList<>();
        List<ImportResponse.WorkflowGroup> groups = groups(answers, publicIds, items, warnings);
        List<ImportResponse.ImportItem> filed = withWorkflowIds(items, groups);

        List<String> unmapped = answers.stream()
                .flatMap(answer -> ModelJson.strings(answer.path("unmapped")).stream())
                .map(String::trim)
                .filter(line -> line.length() > 1 && !EMPTY_NOTES.contains(line))
                .distinct()
                .limit(MAX_UNMAPPED)
                .toList();

        List<ImportResponse.Skipped> rejections = skipped.entrySet().stream()
                .map(entry -> new ImportResponse.Skipped(entry.getKey(), entry.getValue()))
                .toList();

        return new ImportResponse(
                fileName, source.length(), filed, unmapped, rejections, schema.categoryLabels(),
                groups, verification(everySegment, covered, answers, warnings));
    }

    /* ------------------------------------------------------------------ source units */

    /**
     * One addressable unit of the upload.
     *
     * <p>Coverage cannot be checked against a wall of text: the model reports that it read
     * everything, and there is nothing to compare that claim to. Numbering the units makes the
     * claim checkable, and the unit is deliberately small — a paragraph, or a single row of a
     * schedule — because a table held whole counts as reflected the moment any one of its rows is
     * used, which is exactly the failure where a whole schedule collapses into one card.
     */
    record Segment(String id, String text, String normalized) {}

    /** How many units one part may be cut into, so a long timetable cannot flood the answer. */
    private static final int MAX_SEGMENTS = 150;

    /** How short a unit may be before it is too generic to prove a quote came from it. */
    private static final int MATCHABLE_SEGMENT = 10;

    private static final java.util.regex.Pattern SEPARATOR_ROW =
            java.util.regex.Pattern.compile("^\\|[\\s|:-]*\\|$");

    /** The parts, each cut into numbered units, with one run of numbers across the document. */
    static List<List<Segment>> segments(List<String> chunks) {
        List<List<Segment>> all = new ArrayList<>();
        int next = 1;
        for (String chunk : chunks) {
            List<Segment> segments = new ArrayList<>();
            for (String unit : units(chunk)) {
                segments.add(new Segment("s" + next++, unit, AiSupport.normalize(unit)));
            }
            all.add(segments);
        }
        return all;
    }

    /** Paragraph blocks, and the rows of a table one by one so each deadline is addressable. */
    private static List<String> units(String chunk) {
        List<String> units = new ArrayList<>();
        for (String block : chunk.split("\n\\s*\n")) {
            String trimmed = block.strip();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (!isTable(trimmed)) {
                units.add(trimmed);
                continue;
            }
            for (String line : trimmed.lines().toList()) {
                String row = line.strip();
                /* The rule under a header row carries no fact and would only be reported unused. */
                if (!row.isEmpty() && !SEPARATOR_ROW.matcher(row).matches()) {
                    units.add(row);
                }
            }
        }
        return capped(units);
    }

    /** Above the cap, neighbouring units share a number rather than the tail going unnumbered. */
    private static List<String> capped(List<String> units) {
        if (units.size() <= MAX_SEGMENTS) {
            return units;
        }
        int perUnit = (units.size() + MAX_SEGMENTS - 1) / MAX_SEGMENTS;
        List<String> capped = new ArrayList<>();
        for (int at = 0; at < units.size(); at += perUnit) {
            capped.add(String.join("\n", units.subList(at, Math.min(units.size(), at + perUnit))));
        }
        return capped;
    }

    /* ------------------------------------------------------------------ evidence */

    /** How many quotes one card may carry, so evidence stays a citation and not a second copy. */
    private static final int MAX_EVIDENCE = 6;

    /** The quotes a card is built on, and the units of the upload they came from. */
    private record Grounded(List<ImportResponse.Evidence> evidence, Set<String> covered) {}

    /**
     * Resolves a card's quotes against the upload and says which units it actually used.
     *
     * <p>The unit number is recomputed here rather than taken from the answer. A model that says
     * it covered s7 has said something unverifiable; a quote that appears in s7 has proved it. So
     * a quote nothing in the source contains is dropped, and coverage is only ever credited to the
     * unit whose own text holds the words.
     */
    private static Grounded ground(JsonNode item, String quote, String haystack, List<Segment> segments) {
        List<String> quotes = new ArrayList<>();
        quotes.add(quote);
        for (JsonNode entry : item.path("evidence")) {
            if (quotes.size() >= MAX_EVIDENCE) {
                break;
            }
            String grounded = AiSupport.groundedQuote(entry.path("quote").asText(""), haystack);
            if (!grounded.isEmpty() && !quotes.contains(grounded)) {
                quotes.add(grounded);
            }
        }

        List<ImportResponse.Evidence> evidence = new ArrayList<>();
        Set<String> covered = new LinkedHashSet<>();
        for (String value : quotes) {
            String first = "";
            for (Segment segment : segments) {
                /* Either the unit holds the quote, or the quote ran across units and holds this
                   one — a citation spanning a heading and its paragraph is the usual case. */
                boolean holds = segment.normalized().contains(value)
                        || (segment.normalized().length() >= MATCHABLE_SEGMENT
                                && value.contains(segment.normalized()));
                if (!holds) {
                    continue;
                }
                covered.add(segment.id());
                if (first.isEmpty()) {
                    first = segment.id();
                }
            }
            evidence.add(new ImportResponse.Evidence(first, value));
        }
        return new Grounded(evidence, covered);
    }

    /* ------------------------------------------------------------------ operation */

    private static final int PURPOSE_MAX = 300;
    private static final int FIELD_MAX = 120;
    private static final int LINE_MAX = 300;
    private static final int MAX_LINES = 12;
    private static final int MAX_CONTROLS = 12;

    /**
     * The operation fields, cleaned the way every other model field is, or null when the answer
     * carried none. An empty object is returned as null so a card without an operation does not
     * ship eight blank fields to the modal.
     */
    private static ImportResponse.Operation operation(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        JsonNode timing = node.path("timing");
        JsonNode resources = node.path("resources");
        ImportResponse.Operation operation = new ImportResponse.Operation(
                line(node.path("purpose"), PURPOSE_MAX),
                new ImportResponse.Timing(
                        line(timing.path("cycle"), FIELD_MAX),
                        line(timing.path("trigger"), FIELD_MAX),
                        line(timing.path("deadline"), FIELD_MAX)),
                collaborators(node.path("collaborators")),
                new ImportResponse.Resources(
                        lines(resources.path("systems")),
                        lines(resources.path("documents")),
                        lines(resources.path("outputs"))),
                lines(node.path("steps")),
                lines(node.path("prerequisites")),
                lines(node.path("followUp")),
                controls(node.path("controls")));
        return operation.isEmpty() ? null : operation;
    }

    private static List<ImportResponse.Collaborator> collaborators(JsonNode node) {
        List<ImportResponse.Collaborator> collaborators = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return collaborators;
        }
        for (JsonNode entry : node) {
            String department = line(entry.path("department"), FIELD_MAX);
            /* A department with no role is a list of names, which is what this field replaced. */
            if (!department.isEmpty() && collaborators.size() < MAX_LINES) {
                collaborators.add(new ImportResponse.Collaborator(
                        department, line(entry.path("role"), LINE_MAX)));
            }
        }
        return collaborators;
    }

    private static List<ImportResponse.Control> controls(JsonNode node) {
        List<ImportResponse.Control> controls = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return controls;
        }
        for (JsonNode entry : node) {
            ImportResponse.Control control = new ImportResponse.Control(
                    line(entry.path("condition"), LINE_MAX),
                    line(entry.path("owner"), FIELD_MAX),
                    line(entry.path("action"), LINE_MAX),
                    line(entry.path("escalation"), LINE_MAX));
            /* A control that says neither what to check nor what to do is not a control. */
            if ((!control.condition().isEmpty() || !control.action().isEmpty())
                    && controls.size() < MAX_CONTROLS) {
                controls.add(control);
            }
        }
        return controls;
    }

    private static List<String> lines(JsonNode node) {
        return AiSupport.trimmedLines(ModelJson.strings(node), MAX_LINES).stream()
                .map(value -> AiSupport.clip(AiSupport.stripExtractionMarkup(value), LINE_MAX))
                .filter(value -> !value.isEmpty())
                .toList();
    }

    private static String line(JsonNode node, int max) {
        return AiSupport.clip(AiSupport.stripExtractionMarkup(node.asText("").trim()), max);
    }

    /** Everything the operation states in words, for the check that no figure was invented. */
    private static String operationProse(ImportResponse.Operation operation) {
        if (operation == null) {
            return "";
        }
        List<String> parts = new ArrayList<>(List.of(
                operation.purpose(), operation.timing().cycle(), operation.timing().trigger(),
                operation.timing().deadline()));
        operation.collaborators().forEach(entry -> {
            parts.add(entry.department());
            parts.add(entry.role());
        });
        parts.addAll(operation.resources().systems());
        parts.addAll(operation.resources().documents());
        parts.addAll(operation.resources().outputs());
        parts.addAll(operation.steps());
        parts.addAll(operation.prerequisites());
        parts.addAll(operation.followUp());
        operation.controls().forEach(control -> {
            parts.add(control.condition());
            parts.add(control.owner());
            parts.add(control.action());
            parts.add(control.escalation());
        });
        return String.join(" ", parts);
    }

    /* ------------------------------------------------------------------ work phases */

    private static final int GROUP_TITLE_MAX = 60;

    /** A phase under construction: its cards in the order they were proposed, and what precedes it. */
    private static final class Phase {
        private final String title;
        private final Set<String> itemIds = new LinkedHashSet<>();
        private final Set<String> after = new LinkedHashSet<>();

        private Phase(String title) {
            this.title = title;
        }
    }

    /**
     * The work phases the surviving cards combine into, merged across the parts of one document.
     *
     * <p>Two parts of a split document describe one phase twice, under near-identical names, and
     * with their own private ids. Merging by name is the same judgement the duplicate-title check
     * already makes about cards, applied one level up; without it a four-phase document comes back
     * as eight phases of two cards each, which is the shape the whole grouping exists to avoid.
     */
    private List<ImportResponse.WorkflowGroup> groups(
            List<JsonNode> answers,
            Map<String, String> publicIds,
            List<ImportResponse.ImportItem> items,
            List<String> warnings) {

        Map<String, Phase> phases = new LinkedHashMap<>();
        /* A part's own group id, mapped to the merged phase it ended up in. */
        Map<String, String> mergedInto = new LinkedHashMap<>();
        int unknownAfter = 0;

        for (int part = 0; part < answers.size(); part++) {
            for (JsonNode group : answers.get(part).path("workflowGroups")) {
                String own = part + "#" + group.path("id").asText("").trim();
                String title = AiSupport.clip(
                        AiSupport.stripExtractionMarkup(group.path("title").asText("").trim()), GROUP_TITLE_MAX);
                if (own.endsWith("#") || title.isEmpty()) {
                    continue;
                }
                String key = phases.entrySet().stream()
                        .filter(entry -> AiSupport.titleOverlap(entry.getValue().title, title) >= AiSupport.SAME_WORK)
                        .map(Map.Entry::getKey)
                        .findFirst()
                        .orElse(own);
                phases.computeIfAbsent(key, ignored -> new Phase(title));
                mergedInto.put(own, key);
                Phase phase = phases.get(key);
                for (String member : ModelJson.strings(group.path("itemIds"))) {
                    String publicId = publicIds.get(part + "#" + member.trim());
                    if (publicId != null) {
                        phase.itemIds.add(publicId);
                    }
                }
                for (String precedes : ModelJson.strings(group.path("after"))) {
                    phase.after.add(part + "#" + precedes.trim());
                }
            }
        }

        /* A card can also name its phase directly, which is how a model that filled workflowId but
           left itemIds short still gets its card placed. */
        for (int part = 0; part < answers.size(); part++) {
            for (JsonNode item : answers.get(part).path("items")) {
                String publicId = publicIds.get(part + "#" + item.path("id").asText(""));
                String key = mergedInto.get(part + "#" + item.path("workflowId").asText("").trim());
                if (publicId != null && key != null
                        && phases.values().stream().noneMatch(phase -> phase.itemIds.contains(publicId))) {
                    phases.get(key).itemIds.add(publicId);
                }
            }
        }

        List<Map.Entry<String, Phase>> populated = phases.entrySet().stream()
                .filter(entry -> !entry.getValue().itemIds.isEmpty())
                .toList();
        Set<String> live = populated.stream().map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet());

        Map<String, Set<String>> dependencies = new LinkedHashMap<>();
        for (Map.Entry<String, Phase> entry : populated) {
            Set<String> resolved = new LinkedHashSet<>();
            for (String raw : entry.getValue().after) {
                String target = mergedInto.get(raw);
                if (target == null || !live.contains(target)) {
                    unknownAfter++;
                } else if (!target.equals(entry.getKey())) {
                    resolved.add(target);
                }
            }
            dependencies.put(entry.getKey(), resolved);
        }

        List<String> order = topological(populated.stream().map(Map.Entry::getKey).toList(), dependencies, warnings);
        Map<String, String> numbered = new LinkedHashMap<>();
        for (int at = 0; at < order.size(); at++) {
            numbered.put(order.get(at), "unit-" + (at + 1));
        }

        List<ImportResponse.WorkflowGroup> groups = new ArrayList<>();
        for (String key : order) {
            groups.add(new ImportResponse.WorkflowGroup(
                    numbered.get(key),
                    phases.get(key).title,
                    List.copyOf(phases.get(key).itemIds),
                    dependencies.get(key).stream().map(numbered::get).filter(java.util.Objects::nonNull).toList()));
        }

        if (unknownAfter > 0) {
            warnings.add("선행 업무로 지정된 업무단위 %d건을 찾지 못해 연결하지 않았습니다.".formatted(unknownAfter));
        }
        Set<String> placed = groups.stream()
                .flatMap(group -> group.itemIds().stream())
                .collect(java.util.stream.Collectors.toSet());
        long loose = items.stream().filter(item -> !placed.contains(item.id())).count();
        if (loose > 0 && !groups.isEmpty()) {
            warnings.add("업무단위에 연결되지 않은 항목이 %d건 있습니다. 어느 흐름에 속하는지 확인해 주세요.".formatted(loose));
        }
        if (groups.isEmpty() && !items.isEmpty()) {
            warnings.add("업무 흐름이 구성되지 않았습니다. 항목별 선후관계를 직접 확인해 주세요.");
        }
        return groups;
    }

    /** Preceding phases first. A cycle cannot be an execution order, so it is reported and broken. */
    private static List<String> topological(
            List<String> keys, Map<String, Set<String>> dependencies, List<String> warnings) {
        List<String> pending = new ArrayList<>(keys);
        List<String> order = new ArrayList<>();
        Set<String> done = new LinkedHashSet<>();
        boolean broken = false;
        while (!pending.isEmpty()) {
            int ready = -1;
            for (int at = 0; at < pending.size(); at++) {
                if (done.containsAll(dependencies.get(pending.get(at)))) {
                    ready = at;
                    break;
                }
            }
            if (ready < 0) {
                ready = 0;
                broken = true;
            }
            String key = pending.remove(ready);
            order.add(key);
            done.add(key);
        }
        if (broken) {
            warnings.add("업무단위의 선후관계가 서로 순환합니다. 실제 순서를 확인해 주세요.");
        }
        return order;
    }

    /** Each card told which phase it ended up in, so the modal can show the flow without guessing. */
    private static List<ImportResponse.ImportItem> withWorkflowIds(
            List<ImportResponse.ImportItem> items, List<ImportResponse.WorkflowGroup> groups) {
        Map<String, String> phaseOf = new LinkedHashMap<>();
        groups.forEach(group -> group.itemIds().forEach(id -> phaseOf.put(id, group.id())));
        return items.stream()
                .map(item -> new ImportResponse.ImportItem(
                        item.id(), item.category(), item.title(), item.detail(), item.properties(),
                        item.questions(), item.sourceQuote(), item.confidence(),
                        phaseOf.getOrDefault(item.id(), ""), item.operation(), item.evidence()))
                .toList();
    }

    /* ------------------------------------------------------------------ verification */

    /** How many unreflected units the modal lists before the rest becomes a single warning. */
    private static final int MAX_UNCOVERED = 20;

    /** How much of an unreflected unit is quoted back, enough to recognise without reprinting it. */
    private static final int EXCERPT_MAX = 140;

    /**
     * What of the upload did and did not reach a card, recomputed from the surviving cards.
     *
     * <p>The model's own reconciliation is read only for its explanations: a heading, a cover page
     * or a table rule genuinely belongs to no work, and the reason it gave saves the author from
     * rechecking it. Whether a unit was used is decided here, from evidence that survived every
     * acceptance check — so a card dropped for an invented number leaves its paragraph listed as
     * unreflected instead of silently vanishing behind a claim that everything was read.
     */
    private static ImportResponse.Verification verification(
            List<Segment> segments, Set<String> covered, List<JsonNode> answers, List<String> warnings) {

        Map<String, String> reasons = new LinkedHashMap<>();
        Set<String> known = segments.stream().map(Segment::id).collect(java.util.stream.Collectors.toSet());
        int invented = 0;
        for (JsonNode answer : answers) {
            for (JsonNode entry : answer.path("coverage")) {
                String sourceId = entry.path("sourceId").asText("").trim();
                String reason = entry.path("reason").asText("").trim();
                if (!known.contains(sourceId)) {
                    invented++;
                } else if (!reason.isEmpty()) {
                    reasons.putIfAbsent(sourceId, AiSupport.clip(reason, LINE_MAX));
                }
            }
        }
        if (invented > 0) {
            warnings.add("원문에 없는 조각 번호 %d건이 검증 결과에 포함되어 무시했습니다.".formatted(invented));
        }

        List<Segment> unreflected = segments.stream().filter(segment -> !covered.contains(segment.id())).toList();
        List<ImportResponse.Uncovered> uncovered = unreflected.stream()
                .limit(MAX_UNCOVERED)
                .map(segment -> new ImportResponse.Uncovered(
                        segment.id(),
                        AiSupport.clip(segment.normalized(), EXCERPT_MAX),
                        reasons.getOrDefault(segment.id(), "이 부분을 근거로 삼은 업무가 없습니다.")))
                .toList();
        if (unreflected.size() > MAX_UNCOVERED) {
            warnings.add("반영하지 못한 원문이 %d건 더 있습니다. 자료를 나누어 다시 정리해 보세요."
                    .formatted(unreflected.size() - MAX_UNCOVERED));
        }
        return new ImportResponse.Verification(
                segments.size(), segments.size() - unreflected.size(), uncovered, List.copyOf(warnings));
    }

    /* ------------------------------------------------------------------ the model call */

    /**
     * One answer per part, asked for together.
     *
     * <p>A part that fails fails the request, as the single call it replaces did. Returning what
     * the other parts found would look like a document with a hole in it rather than an error, and
     * the author would adopt the half they were shown.
     */
    private List<JsonNode> read(List<String> chunks, List<List<Segment>> segments, String fileName) {
        String allowed = json.compact(support.allowedProperties(IMPORT_PROPERTY_KEYS::contains));
        try (var runner = Executors.newFixedThreadPool(Math.min(chunks.size(), MAX_PARALLEL))) {
            List<Future<JsonNode>> pending = new ArrayList<>();
            for (int part = 0; part < chunks.size(); part++) {
                String user = userMessage(allowed, fileName, chunks, segments, part);
                pending.add(runner.submit(() -> openAiClient.ask(
                        "import", "handover_import",
                        resources.schema("import"), resources.prompt("import"), user)));
            }
            List<JsonNode> answers = new ArrayList<>();
            for (Future<JsonNode> answer : pending) {
                answers.add(answer.get());
            }
            return answers;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw ApiException.badGateway("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof RuntimeException known) {
                throw known;
            }
            throw ApiException.badGateway("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
    }

    /**
     * The message for one part: the upload as numbered units, so the answer can say where each
     * work came from and the service can check the claim.
     */
    static String userMessage(
            String allowed, String fileName, List<String> chunks, List<List<Segment>> segments, int part) {
        StringBuilder body = new StringBuilder();
        for (Segment segment : segments.get(part)) {
            body.append("<조각 id=\"").append(segment.id()).append("\">\n")
                    .append(segment.text()).append("\n</조각>\n");
        }
        if (chunks.size() == 1) {
            return "섹션별 허용속성: %s\n\n<원문 파일=\"%s\">\n%s</원문>".formatted(allowed, fileName, body);
        }
        String previous = chunks.get(part - 1 < 0 ? 0 : part - 1);
        String tail = part == 0 ? ""
                : previous.length() <= CHUNK_OVERLAP
                        ? previous
                        : previous.substring(previous.length() - CHUNK_OVERLAP);
        return ("섹션별 허용속성: %s\n\n"
                + "이 원문은 한 문서를 나눈 %d개 부분 중 %d번째다. 이 부분에 있는 업무만 정리한다. "
                + "<앞부분끝>은 문장이 잘리지 않도록 붙인 직전 부분의 꼬리이므로, 그 안에서만 근거를 찾은 항목은 만들지 않는다.\n\n"
                + "%s<원문 파일=\"%s\" 부분=\"%d/%d\">\n%s</원문>")
                .formatted(allowed, chunks.size(), part + 1,
                        tail.isEmpty() ? "" : "<앞부분끝>\n" + tail + "\n</앞부분끝>\n\n",
                        fileName, part + 1, chunks.size(), body);
    }

    /**
     * The document split into parts at blank lines, so a paragraph is never cut in half.
     *
     * <p>The target is a size, not a count: a short paste stays one part and keeps its old
     * behaviour exactly. A document long enough to need more than {@value #MAX_CHUNKS} parts gets
     * larger parts instead, because past that the calls cost more than the time they save.
     */
    static List<String> chunk(String source) {
        int target = Math.max(CHUNK_TARGET, (source.length() + MAX_CHUNKS - 1) / MAX_CHUNKS);
        /* Converters sometimes insert a blank line and a repeated header halfway through one
           table. Treat the complete table as one unit even though it now consists of two blocks. */
        if (source.length() <= target || (source.length() <= TABLE_CEILING && isTable(source))) {
            return List.of(source);
        }
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String piece : pieces(source, target)) {
            /* Half a part is the floor: a title line left alone as its own part has no work in it,
               and the table it introduces then arrives in the next part with nothing naming it. */
            if (current.length() >= target / 2 && current.length() + piece.length() > target) {
                chunks.add(current.toString().strip());
                current.setLength(0);
            }
            current.append(piece).append("\n\n");
        }
        if (!current.toString().isBlank()) {
            chunks.add(current.toString().strip());
        }
        return chunks.isEmpty() ? List.of(source) : chunks;
    }

    /** How far past a part's size a table is allowed to stretch rather than be cut across rows. */
    private static final int TABLE_CEILING = 4 * CHUNK_TARGET;

    /**
     * The pieces a part is packed from: paragraphs, then the lines of a paragraph too big to be one,
     * and finally a straight cut for a line that is itself longer than a part — a converted
     * spreadsheet arrives as exactly that.
     *
     * <p>A table is the exception and stays whole. Its rows are one work unit however many of them
     * there are, so cutting it hands each part the same unit and the author gets the same card back
     * three times: an interview timetable split into four parts came back as three near-identical
     * "면접시간표 운영" items, where the whole table had produced one.
     */
    private static List<String> pieces(String source, int target) {
        List<String> pieces = new ArrayList<>();
        for (String block : source.split("\n\s*\n")) {
            if (block.isBlank()) {
                continue;
            }
            if (block.length() <= target || (block.length() <= TABLE_CEILING && isTable(block))) {
                pieces.add(block.strip());
                continue;
            }
            for (String line : block.split("\n")) {
                if (line.isBlank()) {
                    continue;
                }
                for (int at = 0; at < line.length(); at += target) {
                    pieces.add(line.substring(at, Math.min(line.length(), at + target)).strip());
                }
            }
        }
        return pieces;
    }

    /** True when most of the block's lines are the pipe-delimited rows a converter writes. */
    private static boolean isTable(String block) {
        List<String> lines = block.lines().filter(line -> !line.isBlank()).toList();
        long rows = lines.stream().filter(line -> line.strip().startsWith("|") && line.strip().endsWith("|")).count();
        return rows * 2 > lines.size();
    }

    private static void skip(Map<String, Integer> skipped, String reason) {
        skipped.merge(reason, 1, Integer::sum);
    }

    private static String fileName(String rawFileName) {
        String name = rawFileName == null ? DEFAULT_FILE_NAME : rawFileName;
        return name.length() <= FILE_NAME_MAX ? name : name.substring(0, FILE_NAME_MAX);
    }
}
