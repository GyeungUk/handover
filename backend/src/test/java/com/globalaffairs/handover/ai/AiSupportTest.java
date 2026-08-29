package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.HandoverSchema;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The helpers that decide what survives from a model answer into the document. */
class AiSupportTest {

    private final HandoverSchema schema = new HandoverSchema(new ObjectMapper());
    private final AiSupport support = new AiSupport(schema);

    @Test
    void escapesEveryCharacterThatCouldOpenATagInTheEditor() {
        assertThat(AiSupport.escapeHtml("<b>a & b</b>")).isEqualTo("&lt;b&gt;a &amp; b&lt;/b&gt;");
    }

    @Test
    void collapsesWhitespaceSoAQuoteCanBeMatchedAgainstItsSource() {
        assertThat(AiSupport.normalize("  두\t줄\n\n입니다  ")).isEqualTo("두 줄 입니다");
        assertThat(AiSupport.normalize(null)).isEmpty();
    }

    @Test
    void buildsTheEntryBodyWithTheQuestionListOnlyWhenThereAreQuestions() {
        assertThat(AiSupport.detailHtml(List.of("첫 문단", "둘째 문단"), List.of()))
                .isEqualTo("<p>첫 문단</p><p>둘째 문단</p>");
        assertThat(AiSupport.detailHtml(List.of("본문"), List.of("담당자는 누구입니까?")))
                .isEqualTo("<p>본문</p><p><strong>확인이 필요한 내용</strong></p><ul><li>담당자는 누구입니까?</li></ul>");
    }

    @Test
    void escapesModelTextInsideTheBodyItBuilds() {
        assertThat(AiSupport.detailHtml(List.of("a<script>b"), List.of("c&d")))
                .contains("a&lt;script&gt;b")
                .contains("c&amp;d");
    }

    @Test
    void keepsOnlyPropertiesTheEditorItselfWouldAccept() {
        Map<String, String> cleaned = support.cleanProperties("plan", List.of(
                new AiSupport.PropertyPair("progress", "50%"),
                new AiSupport.PropertyPair("progress2", "50%"),
                new AiSupport.PropertyPair("next", "  박민서 주임  "),
                new AiSupport.PropertyPair("due", "   "),
                new AiSupport.PropertyPair("impact", "높음")));

        assertThat(cleaned).containsExactlyInAnyOrderEntriesOf(Map.of("progress", "50%", "next", "박민서 주임"));
    }

    @Test
    void rejectsAValueThatIsNotOneOfTheFieldsOwnOptions() {
        assertThat(support.cleanProperties("plan", List.of(new AiSupport.PropertyPair("progress", "거의 다 됨"))))
                .isEmpty();
        assertThat(support.cleanProperties("issue", List.of(new AiSupport.PropertyPair("impact", "긴급"))))
                .containsEntry("impact", "긴급");
    }

    @Test
    void appliesTheCallersOwnKeyFilterOnTopOfTheSchema() {
        List<AiSupport.PropertyPair> pairs =
                List.of(new AiSupport.PropertyPair("impact", "높음"), new AiSupport.PropertyPair("department", "학사지원팀"));
        assertThat(support.cleanProperties("issue", pairs, "impact"::equals)).containsOnlyKeys("impact");
    }

    @Test
    void describesEveryAllowedPropertyWithItsLabelAndEitherOptionsOrAnExample() {
        Map<String, Object> allowed = support.allowedProperties();
        assertThat(allowed).containsOnlyKeys("responsibility", "plan", "issue", "pending");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> plan = (List<Map<String, Object>>) allowed.get("plan");
        assertThat(plan).hasSize(3);
        assertThat(plan.get(0)).containsEntry("key", "due").containsEntry("설명", "목표 일정")
                .containsEntry("예시", "예: 2026. 09. 06");
        assertThat(plan.get(1)).containsEntry("key", "progress").containsKey("선택지").doesNotContainKey("예시");
    }

    @Test
    void narrowsTheAllowedPropertiesWhenTheDraftRouteOnlyPermitsJudgementFields() {
        Map<String, Object> allowed =
                support.allowedProperties(Map.of("importance", true, "impact", true)::containsKey);
        assertThat((List<?>) allowed.get("plan")).isEmpty();
        assertThat((List<?>) allowed.get("responsibility")).hasSize(1);
    }

    @Test
    void trimsDropsBlanksAndCapsAModelStringList() {
        assertThat(AiSupport.trimmedLines(List.of(" a ", "", "  ", "b", "c", "d"), 3)).containsExactly("a", "b", "c");
        assertThat(AiSupport.trimmedLines(null, 3)).isEmpty();
    }

    @Test
    void clipsAndTruncatesTheWayTheOriginalRoutesSliced() {
        assertThat(AiSupport.clip("  abcdef  ", 3)).isEqualTo("abc");
        assertThat(AiSupport.clip(null, 3)).isEmpty();
        assertThat(AiSupport.truncate("  abcdef", 4)).isEqualTo("  ab");
    }
}
