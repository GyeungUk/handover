package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.AnnualResponse;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Turns last year's handover document into a first draft of next year's.
 * Port of {@code app/api/annual/route.ts}.
 */
@Service
public class AnnualService {

    private static final int MAX_ENTRIES = 80;
    private static final int TEXT_MAX = 20000;
    private static final int TOTAL_TEXT_MAX = 600000;
    private static final int MAX_ITEMS = MAX_ENTRIES * 2;
    private static final int MAX_QUESTIONS = 3;
    private static final int TITLE_MAX = 80;
    private static final int INCOMING_TITLE_MAX = 200;

    private static final String NOT_CONFIGURED = "연간 갱신 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.";

    /**
     * The order the review is presented in: what needs rewriting first, what is only being kept last.
     * This is presentation policy, unlike the action names themselves, which come from the schema.
     */
    private static final List<String> REVIEW_ORDER = List.of("revise", "new", "archive", "keep");

    private final HandoverSchema schema;
    private final OpenAiClient openAiClient;
    private final AiResources resources;
    private final AiSupport support;
    private final JsonStringify json;
    private final Clock clock;

    public AnnualService(
            HandoverSchema schema,
            OpenAiClient openAiClient,
            AiResources resources,
            AiSupport support,
            JsonStringify json,
            Clock clock) {
        this.schema = schema;
        this.openAiClient = openAiClient;
        this.resources = resources;
        this.support = support;
        this.json = json;
        this.clock = clock;
    }

    /** Where an action sits in a presentation order; anything unlisted sorts last. */
    static int rank(List<String> order, String value) {
        int index = order.indexOf(value);
        return index < 0 ? order.size() : index;
    }

    /** One entry as the workspace sends it for renewal. */
    public record IncomingEntry(
            String id, String category, String title, String text, Map<String, String> properties) {}

    private record Document(String id, String category, String title, String body, Map<String, String> properties) {}

    public AnnualResponse renew(List<IncomingEntry> entries, Integer year) {
        openAiClient.requireConfigured(NOT_CONFIGURED);

        /* `Number(body.year) || currentYear` in the route: 0, null and a non-number all fall back. */
        int fromYear = year == null || year == 0 ? LocalDate.now(clock).getYear() : year;
        int toYear = fromYear + 1;

        List<IncomingEntry> candidates = (entries == null ? List.<IncomingEntry>of() : entries).stream()
                .filter(entry -> entry != null
                        && entry.id() != null && !entry.id().isEmpty()
                        && entry.title() != null && !entry.title().isEmpty()
                        && !AiSupport.normalize(entry.text()).isEmpty())
                .filter(entry -> schema.isCategory(entry.category()))
                .toList();

        if (candidates.size() > MAX_ENTRIES) {
            throw new ApiException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                    "정확한 갱신을 위해 한 번에 80개 이하의 항목만 검토할 수 있습니다.");
        }
        if (candidates.stream().anyMatch(entry -> AiSupport.normalize(entry.text()).length() > TEXT_MAX)) {
            throw new ApiException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                    "정확한 갱신을 위해 항목 본문은 20,000자 이하여야 합니다.");
        }

        List<Document> documents = candidates.stream()
                .map(entry -> new Document(
                        entry.id(),
                        entry.category(),
                        AiSupport.truncate(entry.title(), INCOMING_TITLE_MAX),
                        AiSupport.normalize(entry.text()),
                        entry.properties() == null ? Map.of() : entry.properties()))
                .toList();

        if (documents.isEmpty()) {
            throw ApiException.badRequest("갱신할 항목이 없습니다. 먼저 인수인계 항목을 작성해 주세요.");
        }
        if (documents.stream().mapToInt(entry -> entry.body().length()).sum() > TOTAL_TEXT_MAX) {
            throw new ApiException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                    "정확한 갱신을 위해 전체 본문을 나누어 검토해 주세요.");
        }

        String user = buildUserContent(documents, fromYear, toYear);
        JsonNode answer = openAiClient.ask(
                "annual", "handover_annual", resources.schema("annual"), resources.prompt("annual"), user);

        return new AnnualResponse(fromYear, toYear, documents.size(), readItems(answer, documents, toYear));
    }

    private String buildUserContent(List<Document> documents, int fromYear, int toYear) {
        List<String> lines = new ArrayList<>();
        lines.add("지난 학년도: %d학년도 / 갱신 대상: %d학년도".formatted(fromYear, toYear));
        lines.add("섹션별 허용속성: %s".formatted(json.compact(support.allowedProperties())));
        lines.add("");
        documents.forEach(entry -> lines.add(String.join("\n",
                "<항목 id=\"%s\" 섹션=\"%s\">".formatted(entry.id(), schema.categoryLabel(entry.category())),
                "제목: " + entry.title(),
                "속성: " + json.compact(entry.properties()),
                "본문: " + entry.body(),
                "</항목>")));
        return String.join("\n", lines);
    }

    private List<AnnualResponse.AnnualItem> readItems(JsonNode answer, List<Document> documents, int toYear) {
        Map<String, Document> byId = documents.stream()
                .collect(Collectors.toMap(Document::id, doc -> doc, (first, second) -> first, LinkedHashMap::new));
        Set<String> used = new HashSet<>();
        List<AnnualResponse.AnnualItem> items = new ArrayList<>();

        for (JsonNode item : answer.path("items")) {
            if (items.size() >= MAX_ITEMS) {
                break;
            }
            String rawAction = item.path("action").asText("");
            String action = schema.isAnnualAction(rawAction) ? rawAction : "keep";
            String entryId = item.path("entryId").asText("");
            Document source = byId.get(entryId);
            /* a proposal about an entry we did not send, or a second one about the same entry, is dropped */
            if ("new".equals(action) && !entryId.isBlank()) {
                continue;
            }
            if (!"new".equals(action) && (source == null || used.contains(entryId))) {
                continue;
            }

            String evidenceEntryId = item.path("evidenceEntryId").asText("").trim();
            Document evidenceSource = byId.get(evidenceEntryId);
            String evidenceQuote = AiSupport.normalize(item.path("evidenceQuote").asText(""));
            if (evidenceSource == null || (!"new".equals(action) && !evidenceSource.id().equals(source.id()))) {
                continue;
            }
            if (evidenceQuote.isEmpty()
                    || !AiSupport.normalize(evidenceSource.title() + " " + evidenceSource.body()).contains(evidenceQuote)) {
                continue;
            }

            String rawCategory = item.path("category").asText("");
            String category = "new".equals(action)
                    ? (schema.isCategory(rawCategory) ? rawCategory : "plan")
                    : source.category();
            List<String> questions = AiSupport.trimmedLines(ModelJson.strings(item.path("questions")), MAX_QUESTIONS);
            List<String> paragraphs = AiSupport.trimmedLines(ModelJson.strings(item.path("paragraphs")), Integer.MAX_VALUE);
            String proposedTitle = item.path("title").asText("").trim();
            String title = ("keep".equals(action) || "archive".equals(action)) ? source.title() : proposedTitle;
            if (title.isEmpty() || paragraphs.isEmpty()) {
                continue;
            }

            String proposedFacts = String.join(" ", title, String.join(" ", paragraphs),
                    item.path("reason").asText(""), "archive".equals(action) ? "" : String.join(" ", questions),
                    ModelJson.propertyPairs(item.path("properties")).stream()
                            .map(pair -> pair.value() == null ? "" : pair.value())
                            .collect(Collectors.joining(" ")));
            String sourceFacts = evidenceSource.title() + " " + evidenceSource.body() + " " + evidenceSource.properties();
            if (!AiSupport.usesOnlyRecordedNumbers(proposedFacts, sourceFacts, Set.of(Integer.toString(toYear)))) {
                continue;
            }
            if (!"new".equals(action)) {
                used.add(source.id());
            }

            boolean archived = "archive".equals(action);
            items.add(new AnnualResponse.AnnualItem(
                    "annual-" + items.size(),
                    action,
                    "new".equals(action) ? null : source.id(),
                    source == null ? "" : source.title(),
                    category,
                    AiSupport.clip(title, TITLE_MAX),
                    AiSupport.detailHtml(paragraphs, archived ? List.of() : questions),
                    support.cleanProperties(category, ModelJson.propertyPairs(item.path("properties"))),
                    item.path("reason").asText("").trim(),
                    archived ? List.of() : questions));
        }

        /* anything the model skipped entirely stays in next year's document untouched */
        for (Document entry : documents) {
            if (used.contains(entry.id()) || items.size() >= MAX_ITEMS) {
                continue;
            }
            items.add(new AnnualResponse.AnnualItem(
                    "annual-" + items.size(),
                    "keep",
                    entry.id(),
                    entry.title(),
                    entry.category(),
                    entry.title(),
                    "",
                    Map.of(),
                    "갱신이 필요한 부분이 확인되지 않아 그대로 두었습니다.",
                    List.of()));
        }

        items.sort(Comparator.comparingInt(item -> rank(REVIEW_ORDER, item.action())));
        return items;
    }
}
