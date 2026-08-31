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
        assertThat(resources.prompt("draft"))
                .contains("기록 기반 편집자", "완료 업무가 plan이나 pending에 들어가지 않았는지");
        assertThat(resources.prompt("import"))
                .contains("업무 단위 식별", "sourceQuote가 원문에 글자 그대로 존재");
        assertThat(resources.prompt("quality"))
                .contains("실행 가능성", "한 누락을 여러 kind로 중복 보고하지 않았는지");
        assertThat(resources.prompt("annual"))
                .contains("지난 학년도", "새 날짜·수치·사람·기관·상태를 추정하지 않았는지");
        assertThat(resources.prompt("calendar-check"))
                .contains("직접적인 의존 관계", "단순한 기간 겹침", "anchorEvent");
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
