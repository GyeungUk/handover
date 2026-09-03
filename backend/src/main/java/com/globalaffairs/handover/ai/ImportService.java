package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.ImportResponse;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.web.ApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.springframework.stereotype.Service;

/**
 * Sorts an existing handover document into the four sections.
 * Port of {@code app/api/import/route.ts}.
 */
@Service
public class ImportService {

    private static final int SOURCE_MAX = 100000;
    private static final int MAX_ITEMS = 200;
    private static final int MAX_QUESTIONS = 3;
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
        List<JsonNode> answers = read(chunk(source), fileName);

        String haystack = AiSupport.normalize(source);
        Set<String> usedQuotes = new java.util.HashSet<>();
        Set<String> usedTitles = new java.util.HashSet<>();
        Map<String, Integer> skipped = new LinkedHashMap<>();
        List<ImportResponse.ImportItem> items = new ArrayList<>();
        for (JsonNode item : answers.stream().flatMap(answer -> answer.path("items").valueStream()).toList()) {
            if (items.size() >= MAX_ITEMS) {
                break;
            }
            String category = item.path("category").asText("");
            String title = item.path("title").asText("").trim();
            JsonNode paragraphNode = item.path("paragraphs");
            if (!schema.isCategory(category) || title.isEmpty() || !paragraphNode.isArray() || paragraphNode.isEmpty()) {
                skip(skipped, SKIPPED_SHAPE);
                continue;
            }

            List<String> questions = AiSupport.trimmedLines(ModelJson.strings(item.path("questions")), MAX_QUESTIONS);
            List<String> paragraphs = AiSupport.importParagraphs(
                    AiSupport.trimmedLines(ModelJson.strings(paragraphNode), Integer.MAX_VALUE));
            if (paragraphs.isEmpty()) {
                skip(skipped, SKIPPED_SHAPE);
                continue;
            }
            String quote = AiSupport.groundedQuote(item.path("sourceQuote").asText(""), haystack);
            /* Ungrounded prose can be fluent but false. It never reaches the editor. */
            if (quote.isEmpty()) {
                skip(skipped, SKIPPED_UNGROUNDED);
                continue;
            }
            if (!usedQuotes.add(quote)) {
                skip(skipped, SKIPPED_REUSED_QUOTE);
                continue;
            }
            /* Two parts of one document propose the same work under two names; the first is kept. */
            if (usedTitles.stream().anyMatch(seen -> AiSupport.titleOverlap(seen, title) >= AiSupport.SAME_WORK)) {
                skip(skipped, SKIPPED_REPEATED_TITLE);
                continue;
            }
            usedTitles.add(title);
            Map<String, String> properties = support.cleanImportProperties(
                    category, ModelJson.propertyPairs(item.path("properties")), source, IMPORT_PROPERTY_KEYS::contains);
            String prose = title + " " + String.join(" ", paragraphs) + " "
                    + String.join(" ", properties.values());
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
            if (AiSupport.carriesExtractionMarkup(title)
                    || paragraphs.stream().anyMatch(AiSupport::carriesExtractionMarkup)
                    || paragraphs.stream().anyMatch(line -> AiSupport.looksCopiedFrom(line, haystack))) {
                skip(skipped, SKIPPED_COPIED);
                continue;
            }

            items.add(new ImportResponse.ImportItem(
                    "import-" + items.size(),
                    category,
                    AiSupport.clip(AiSupport.stripExtractionMarkup(title), TITLE_MAX),
                    AiSupport.detailHtml(
                            paragraphs.stream().map(AiSupport::stripExtractionMarkup).toList(), questions),
                    properties,
                    questions,
                    quote,
                    "high".equals(item.path("confidence").asText("")) ? "high" : "low"));
        }

        items.sort(Comparator.comparingInt(item -> schema.categoryOrder(item.category())));

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
                fileName, source.length(), items, unmapped, rejections, schema.categoryLabels());
    }

    /**
     * One answer per part, asked for together.
     *
     * <p>A part that fails fails the request, as the single call it replaces did. Returning what
     * the other parts found would look like a document with a hole in it rather than an error, and
     * the author would adopt the half they were shown.
     */
    private List<JsonNode> read(List<String> chunks, String fileName) {
        String allowed = json.compact(support.allowedProperties(IMPORT_PROPERTY_KEYS::contains));
        try (var runner = Executors.newFixedThreadPool(Math.min(chunks.size(), MAX_PARALLEL))) {
            List<Future<JsonNode>> pending = new ArrayList<>();
            for (int part = 0; part < chunks.size(); part++) {
                String user = userMessage(allowed, fileName, chunks, part);
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
     * The message for one part. A document that fits in a single call is described exactly as it
     * was before the split, so short pastes see no change at all.
     */
    private static String userMessage(String allowed, String fileName, List<String> chunks, int part) {
        String body = chunks.get(part);
        if (chunks.size() == 1) {
            return "섹션별 허용속성: %s\n\n<원문 파일=\"%s\">\n%s\n</원문>".formatted(allowed, fileName, body);
        }
        String previous = part == 0 ? "" : chunks.get(part - 1);
        String tail = previous.length() <= CHUNK_OVERLAP
                ? previous
                : previous.substring(previous.length() - CHUNK_OVERLAP);
        return ("섹션별 허용속성: %s\n\n"
                + "이 원문은 한 문서를 나눈 %d개 부분 중 %d번째다. 이 부분에 있는 업무만 정리한다. "
                + "<앞부분끝>은 문장이 잘리지 않도록 붙인 직전 부분의 꼬리이므로, 그 안에서만 근거를 찾은 항목은 만들지 않는다.\n\n"
                + "%s<원문 파일=\"%s\" 부분=\"%d/%d\">\n%s\n</원문>")
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
