package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The schemas keep enum values as {@code $enumFrom} markers so the section keys, finding kinds and
 * action names live in one place. These cases pin what the markers resolve to, which is exactly the
 * literal arrays the TypeScript routes send.
 */
class AiResourcesTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HandoverSchema schema = new HandoverSchema(objectMapper);
    private final AcademicCalendar calendar =
            new AcademicCalendar(objectMapper, new OrgData(objectMapper));
    private final AiResources resources = new AiResources(objectMapper, schema, calendar);

    private static List<String> values(JsonNode enumNode) {
        return java.util.stream.StreamSupport.stream(enumNode.spliterator(), false)
                .map(JsonNode::asText)
                .toList();
    }

    @Test
    void resolvesTheSectionKeysTheDraftAndImportSchemasConstrainTheModelTo() {
        for (String route : List.of("draft", "import", "annual")) {
            JsonNode categories = findEnum(resources.schema(route), "category");
            assertThat(values(categories))
                    .as("category enum in %s", route)
                    .containsExactly("responsibility", "plan", "issue", "pending");
        }
    }

    @Test
    void resolvesTheFiveFindingKinds() {
        assertThat(values(findEnum(resources.schema("quality"), "kind")))
                .containsExactly("지시대명사", "연락처", "일정", "근거", "범위");
    }

    @Test
    void resolvesTheRenewalAndAlignmentActions() {
        assertThat(values(findEnum(resources.schema("annual"), "action")))
                .containsExactly("keep", "revise", "new", "archive");
        assertThat(values(findEnum(resources.schema("calendar-check"), "action")))
                .containsExactly("shift", "keep", "review");
    }

    @Test
    void leavesNoUnresolvedMarkerInAnySchema() {
        for (String route : List.of("draft", "import", "quality", "annual", "calendar-check")) {
            assertThat(resources.schema(route).toString())
                    .as("resolved schema for %s", route)
                    .doesNotContain("$enumFrom");
        }
    }

    @Test
    void keepsTheEnumsThatAreNotDomainDataAsTheyWereWritten() {
        /* `basis` and `confidence` are answer qualifiers, not org data, so they stay literal. */
        assertThat(values(findEnum(resources.schema("draft"), "basis"))).containsExactly("record", "inferred");
        assertThat(values(findEnum(resources.schema("import"), "confidence"))).containsExactly("high", "low");
        assertThat(values(findEnum(resources.schema("quality"), "severity"))).containsExactly("high", "low");
    }

    @Test
    void loadsEveryPromptWithTheKoreanWordingTheRouteHandlersUse() {
        assertThat(resources.prompt("draft")).startsWith("너는 한국 대학 국제처의 업무 인수인계서 작성을 돕는다.");
        assertThat(resources.prompt("quality")).contains("지시대명사");
        assertThat(resources.prompt("calendar-check")).contains("anchorEvent");
        for (String route : List.of("draft", "import", "quality", "annual", "calendar-check")) {
            assertThat(resources.prompt(route)).as("prompt for %s", route).isNotBlank();
        }
    }

    /** Finds the `enum` array belonging to the named property, wherever it sits in the tree. */
    private static JsonNode findEnum(JsonNode node, String property) {
        JsonNode direct = node.path("properties").path(property).path("enum");
        if (direct.isArray()) return direct;
        for (JsonNode child : node) {
            JsonNode found = findEnum(child, property);
            if (found != null) return found;
        }
        return null;
    }
}
