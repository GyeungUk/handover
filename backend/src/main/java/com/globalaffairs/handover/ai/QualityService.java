package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.QualityResponse;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.web.ApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Reviews written entries from the successor's point of view.
 * Port of {@code app/api/quality/route.ts}.
 */
@Service
public class QualityService {

    private static final int MAX_ENTRIES = 40;
    private static final int TEXT_MAX = 1500;
    private static final int TITLE_MAX = 120;
    private static final int MAX_FINDINGS = 20;
    private static final int MAX_PER_ENTRY = 3;

    private static final String NOT_CONFIGURED = "점검 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.";

    private final HandoverSchema schema;
    private final OpenAiClient openAiClient;
    private final AiResources resources;

    public QualityService(HandoverSchema schema, OpenAiClient openAiClient, AiResources resources) {
        this.schema = schema;
        this.openAiClient = openAiClient;
        this.resources = resources;
    }

    /** One entry as the workspace sends it for review. */
    public record IncomingEntry(String id, String category, String title, String text) {}

    private record Document(String id, String section, String title, String body) {}

    public QualityResponse check(List<IncomingEntry> entries) {
        openAiClient.requireConfigured(NOT_CONFIGURED);

        if (entries == null || entries.isEmpty()) {
            throw ApiException.badRequest("점검할 항목이 없습니다.");
        }

        List<Document> documents = entries.stream()
                .filter(entry -> entry != null
                        && entry.id() != null && !entry.id().isEmpty()
                        && entry.title() != null && !entry.title().isEmpty()
                        && !AiSupport.normalize(entry.text()).isEmpty())
                .limit(MAX_ENTRIES)
                .map(entry -> new Document(
                        entry.id(),
                        schema.categoryLabels().getOrDefault(entry.category(), "기타"),
                        AiSupport.truncate(entry.title(), TITLE_MAX),
                        AiSupport.truncate(AiSupport.normalize(entry.text()), TEXT_MAX)))
                .toList();

        if (documents.isEmpty()) {
            throw ApiException.badRequest("점검할 내용이 없습니다.");
        }

        String user = documents.stream()
                .map(doc -> "<문서 id=\"%s\" 섹션=\"%s\">\n제목: %s\n본문: %s\n</문서>"
                        .formatted(doc.id(), doc.section(), doc.title(), doc.body()))
                .collect(Collectors.joining("\n\n"));

        JsonNode answer = openAiClient.ask(
                "quality", "handover_quality", resources.schema("quality"), resources.prompt("quality"), user);

        Map<String, Document> byId = new LinkedHashMap<>();
        Map<String, Integer> entryOrder = new HashMap<>();
        documents.forEach(doc -> {
            byId.put(doc.id(), doc);
            entryOrder.putIfAbsent(doc.id(), entryOrder.size());
        });

        Map<String, Integer> perEntry = new HashMap<>();
        List<QualityResponse.QualityFinding> findings = new ArrayList<>();

        for (JsonNode item : answer.path("findings")) {
            String entryId = item.path("entryId").asText("");
            Document document = byId.get(entryId);
            String quote = AiSupport.normalize(item.path("quote").asText(""));
            /* a finding only counts if the phrase it names is really in that entry */
            if (document == null || quote.isEmpty() || !document.body().contains(quote)) {
                continue;
            }
            String kind = item.path("kind").asText("");
            if (!schema.findingKinds().contains(kind)) {
                continue;
            }
            int used = perEntry.getOrDefault(entryId, 0);
            if (used >= MAX_PER_ENTRY || findings.size() >= MAX_FINDINGS) {
                continue;
            }
            perEntry.put(entryId, used + 1);
            findings.add(new QualityResponse.QualityFinding(
                    "finding-" + findings.size(),
                    entryId,
                    kind,
                    "high".equals(item.path("severity").asText("")) ? "high" : "low",
                    quote,
                    item.path("message").asText("").trim(),
                    item.path("suggestion").asText("").trim()));
        }

        findings.sort(Comparator
                .comparingInt((QualityResponse.QualityFinding finding) -> "high".equals(finding.severity()) ? 0 : 1)
                .thenComparingInt(finding -> entryOrder.getOrDefault(finding.entryId(), Integer.MAX_VALUE)));

        return new QualityResponse(documents.size(), findings);
    }
}
