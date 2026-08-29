package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.ai.dto.QualityResponse;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/** A finding only counts if the phrase it names is really in the entry it points at. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QualityServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private OpenAiClient openAiClient;

    private QualityService service;

    @BeforeEach
    void setUp() {
        HandoverSchema schema = new HandoverSchema(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, new OrgData(objectMapper));
        service = new QualityService(schema, openAiClient, new AiResources(objectMapper, schema, calendar));
    }

    private void modelAnswers(String json) {
        try {
            when(openAiClient.ask(anyString(), anyString(), any(), anyString(), anyString()))
                    .thenReturn(objectMapper.readTree(json));
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static QualityService.IncomingEntry entry(String id, String text) {
        return new QualityService.IncomingEntry(id, "plan", "제목 " + id, text);
    }

    @Test
    void refusesAnEmptyRequest() {
        assertThatThrownBy(() -> service.check(List.of()))
                .isInstanceOf(ApiException.class)
                .hasMessage("점검할 항목이 없습니다.");
        assertThatThrownBy(() -> service.check(null)).hasMessage("점검할 항목이 없습니다.");
    }

    @Test
    void refusesARequestWhoseEntriesAreAllUnusable() {
        assertThatThrownBy(() -> service.check(List.of(
                        new QualityService.IncomingEntry(null, "plan", "제목", "본문"),
                        new QualityService.IncomingEntry("e2", "plan", "제목", "   "))))
                .hasMessage("점검할 내용이 없습니다.");
    }

    @Test
    void keepsOnlyFindingsWhoseQuoteAppearsInTheEntryTheyName() {
        modelAnswers("""
                {"findings":[
                  {"entryId":"e1","kind":"지시대명사","severity":"high","quote":"그 파일","message":"m","suggestion":"s"},
                  {"entryId":"e1","kind":"일정","severity":"low","quote":"원문에 없는 표현","message":"m","suggestion":"s"},
                  {"entryId":"없는항목","kind":"일정","severity":"high","quote":"그 파일","message":"m","suggestion":"s"}
                ]}""");

        QualityResponse response = service.check(List.of(entry("e1", "그 파일을 참고해서 처리하시면 됩니다.")));

        assertThat(response.checked()).isEqualTo(1);
        assertThat(response.findings()).hasSize(1);
        assertThat(response.findings().get(0).quote()).isEqualTo("그 파일");
        assertThat(response.findings().get(0).id()).isEqualTo("finding-0");
    }

    @Test
    void rejectsAFindingKindThatIsNotOneOfTheFive() {
        modelAnswers("""
                {"findings":[{"entryId":"e1","kind":"문체","severity":"high","quote":"그 파일","message":"m","suggestion":"s"}]}""");

        assertThat(service.check(List.of(entry("e1", "그 파일을 참고하세요."))).findings()).isEmpty();
    }

    @Test
    void allowsAtMostThreeFindingsPerEntry() {
        String one = "{\"entryId\":\"e1\",\"kind\":\"근거\",\"severity\":\"low\",\"quote\":\"그 파일\",\"message\":\"m\",\"suggestion\":\"s\"}";
        modelAnswers("{\"findings\":[" + String.join(",", java.util.Collections.nCopies(5, one)) + "]}");

        assertThat(service.check(List.of(entry("e1", "그 파일을 참고하세요."))).findings()).hasSize(3);
    }

    @Test
    void putsBlockingFindingsFirstAndThenFollowsDocumentOrder() {
        modelAnswers("""
                {"findings":[
                  {"entryId":"e2","kind":"일정","severity":"low","quote":"나중에","message":"m","suggestion":"s"},
                  {"entryId":"e2","kind":"근거","severity":"high","quote":"나중에","message":"m","suggestion":"s"},
                  {"entryId":"e1","kind":"범위","severity":"high","quote":"전부","message":"m","suggestion":"s"}
                ]}""");

        QualityResponse response = service.check(List.of(
                entry("e1", "전부 처리했습니다."),
                entry("e2", "나중에 정리하겠습니다.")));

        assertThat(response.findings()).extracting(QualityResponse.QualityFinding::entryId)
                .containsExactly("e1", "e2", "e2");
        assertThat(response.findings()).extracting(QualityResponse.QualityFinding::severity)
                .containsExactly("high", "high", "low");
        /* Ids are assigned before the sort, exactly as the Worker assigned them. */
        assertThat(response.findings()).extracting(QualityResponse.QualityFinding::id)
                .containsExactly("finding-2", "finding-1", "finding-0");
    }

    @Test
    void matchesAQuoteAgainstTheWhitespaceCollapsedEntryText() {
        modelAnswers("""
                {"findings":[{"entryId":"e1","kind":"지시대명사","severity":"high",
                  "quote":"  늘 하던   대로  ","message":"m","suggestion":"s"}]}""");

        QualityResponse response = service.check(List.of(entry("e1", "늘 하던\n대로   처리합니다.")));

        assertThat(response.findings()).hasSize(1);
        assertThat(response.findings().get(0).quote()).isEqualTo("늘 하던 대로");
    }
}
