package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.ImportResponse;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.web.ApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Sorts an existing handover document into the four sections.
 * Port of {@code app/api/import/route.ts}.
 */
@Service
public class ImportService {

    private static final int SOURCE_MAX = 20000;
    private static final int MAX_ITEMS = 16;
    private static final int MAX_QUESTIONS = 3;
    private static final int MAX_UNMAPPED = 4;
    private static final int TITLE_MAX = 80;
    private static final int FILE_NAME_MAX = 80;
    private static final String DEFAULT_FILE_NAME = "붙여넣은 내용";

    private static final String NOT_CONFIGURED = "자동 분류 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.";

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

        String source = AiSupport.clip(rawSource, SOURCE_MAX);
        if (source.length() < 30) {
            throw ApiException.badRequest("읽을 내용이 너무 짧습니다. 자료를 다시 올리거나 내용을 붙여넣어 주세요.");
        }

        String fileName = fileName(rawFileName);
        String user = "섹션별 허용속성: %s\n\n<원문 파일=\"%s\">\n%s\n</원문>"
                .formatted(json.compact(support.allowedProperties()), fileName, source);

        JsonNode answer = openAiClient.ask(
                "import", "handover_import", resources.schema("import"), resources.prompt("import"), user);

        String haystack = AiSupport.normalize(source);
        List<ImportResponse.ImportItem> items = new ArrayList<>();
        for (JsonNode item : answer.path("items")) {
            if (items.size() >= MAX_ITEMS) {
                break;
            }
            String category = item.path("category").asText("");
            String title = item.path("title").asText("").trim();
            JsonNode paragraphNode = item.path("paragraphs");
            if (!schema.isCategory(category) || title.isEmpty() || !paragraphNode.isArray() || paragraphNode.isEmpty()) {
                continue;
            }

            List<String> questions = AiSupport.trimmedLines(ModelJson.strings(item.path("questions")), MAX_QUESTIONS);
            List<String> paragraphs = AiSupport.trimmedLines(ModelJson.strings(paragraphNode), Integer.MAX_VALUE);
            /* an evidence line only counts if the phrase it names is really in the uploaded text */
            String quote = AiSupport.normalize(item.path("sourceQuote").asText(""));

            items.add(new ImportResponse.ImportItem(
                    "import-" + items.size(),
                    category,
                    AiSupport.clip(title, TITLE_MAX),
                    AiSupport.detailHtml(paragraphs, questions),
                    support.cleanProperties(category, ModelJson.propertyPairs(item.path("properties"))),
                    questions,
                    !quote.isEmpty() && haystack.contains(quote) ? quote : "",
                    "high".equals(item.path("confidence").asText("")) ? "high" : "low"));
        }

        items.sort(Comparator.comparingInt(item -> schema.categoryOrder(item.category())));

        List<String> unmapped = ModelJson.strings(answer.path("unmapped")).stream()
                .map(String::trim)
                .filter(line -> line.length() > 1 && !EMPTY_NOTES.contains(line))
                .limit(MAX_UNMAPPED)
                .toList();

        return new ImportResponse(fileName, source.length(), items, unmapped, schema.categoryLabels());
    }

    private static String fileName(String rawFileName) {
        String name = rawFileName == null ? DEFAULT_FILE_NAME : rawFileName;
        return name.length() <= FILE_NAME_MAX ? name : name.substring(0, FILE_NAME_MAX);
    }
}
