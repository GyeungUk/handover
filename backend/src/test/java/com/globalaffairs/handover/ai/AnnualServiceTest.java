package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.ai.dto.AnnualResponse;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/** Turning last year's document into next year's first draft, without losing an entry on the way. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AnnualServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private OpenAiClient openAiClient;

    private AnnualService service;

    @BeforeEach
    void setUp() {
        HandoverSchema schema = new HandoverSchema(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, new OrgData(objectMapper));
        service = new AnnualService(
                schema,
                openAiClient,
                new AiResources(objectMapper, schema, calendar),
                new AiSupport(schema),
                new JsonStringify(objectMapper),
                Clock.fixed(Instant.parse("2026-08-29T00:00:00Z"), ZoneOffset.UTC));
    }

    private void modelAnswers(String json) {
        try {
            when(openAiClient.ask(anyString(), anyString(), any(), anyString(), anyString()))
                    .thenReturn(objectMapper.readTree(json));
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static AnnualService.IncomingEntry entry(String id, String title) {
        return new AnnualService.IncomingEntry(id, "plan", title, "지난해 본문입니다.", Map.of("progress", "완료"));
    }

    @Test
    void refusesARequestWithNothingUsableToRenew() {
        assertThatThrownBy(() -> service.renew(List.of(), 2026))
                .isInstanceOf(ApiException.class)
                .hasMessage("갱신할 항목이 없습니다. 먼저 인수인계 항목을 작성해 주세요.");
        assertThatThrownBy(() -> service.renew(
                        List.of(new AnnualService.IncomingEntry("e1", "unknown-section", "제목", "본문", Map.of())), 2026))
                .hasMessage("갱신할 항목이 없습니다. 먼저 인수인계 항목을 작성해 주세요.");
    }

    @Test
    void fallsBackToTheCurrentYearWhenTheRequestNamedNone() {
        modelAnswers("{\"items\":[]}");

        AnnualResponse response = service.renew(List.of(entry("e1", "제목")), null);

        assertThat(response.fromYear()).isEqualTo(2026);
        assertThat(response.toYear()).isEqualTo(2027);
        assertThat(response.reviewed()).isEqualTo(1);
    }

    @Test
    void carriesAnEntryTheModelIgnoredIntoNextYearUntouched() {
        modelAnswers("{\"items\":[]}");

        AnnualResponse response = service.renew(List.of(entry("e1", "체류기간 연장 접수")), 2026);

        assertThat(response.items()).hasSize(1);
        AnnualResponse.AnnualItem item = response.items().get(0);
        assertThat(item.action()).isEqualTo("keep");
        assertThat(item.entryId()).isEqualTo("e1");
        assertThat(item.title()).isEqualTo("체류기간 연장 접수");
        assertThat(item.detail()).isEmpty();
        assertThat(item.reason()).isEqualTo("갱신이 필요한 부분이 확인되지 않아 그대로 두었습니다.");
    }

    @Test
    void sendsTheWholeSavedBodyInsteadOfSilentlyCuttingItAtTwelveHundredCharacters() {
        modelAnswers("{\"items\":[]}");
        String tail = "본문 끝의 이월 근거";
        AnnualService.IncomingEntry longEntry = new AnnualService.IncomingEntry(
                "e1", "plan", "제목", "가".repeat(1300) + tail, Map.of());

        service.renew(List.of(longEntry), 2026);

        org.mockito.ArgumentCaptor<String> user = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(openAiClient).ask(anyString(), anyString(), any(), anyString(), user.capture());
        assertThat(user.getValue()).contains(tail);
    }

    @Test
    void fallsBackToKeepWhenARevisionInventsANumberNotPresentInTheSource() {
        modelAnswers("""
                {"items":[{"action":"revise","entryId":"e1","category":"plan","title":"수정 제안",
                  "paragraphs":["99명을 처리합니다."],"properties":[],"reason":"갱신","questions":[],
                  "evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."}]}""");

        AnnualResponse.AnnualItem item = service.renew(List.of(entry("e1", "원제목")), 2026).items().get(0);
        assertThat(item.action()).isEqualTo("keep");
        assertThat(item.title()).isEqualTo("원제목");
    }

    @Test
    void dropsASecondProposalAboutTheSameEntry() {
        modelAnswers("""
                {"items":[
                  {"action":"revise","entryId":"e1","category":"plan","title":"첫 제안","paragraphs":["본문"],
                   "properties":[],"reason":"이유","questions":["질문"],"evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."},
                  {"action":"archive","entryId":"e1","category":"plan","title":"두 번째 제안","paragraphs":["본문"],
                   "properties":[],"reason":"이유","questions":[],"evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."}
                ]}""");

        assertThat(service.renew(List.of(entry("e1", "제목")), 2026).items())
                .extracting(AnnualResponse.AnnualItem::title)
                .containsExactly("첫 제안");
    }

    @Test
    void dropsAProposalAboutAnEntryTheRequestNeverSent() {
        modelAnswers("""
                {"items":[{"action":"revise","entryId":"없는항목","category":"plan","title":"제안","paragraphs":["본문"],
                  "properties":[],"reason":"이유","questions":["질문"]}]}""");

        /* The unknown proposal is dropped, and e1 falls through to the untouched-keep pass. */
        assertThat(service.renew(List.of(entry("e1", "원래 제목")), 2026).items())
                .extracting(AnnualResponse.AnnualItem::title)
                .containsExactly("원래 제목");
    }

    @Test
    void acceptsANewItemWithNoEntryToActOn() {
        modelAnswers("""
                {"items":[{"action":"new","entryId":"","category":"pending","title":"이월된 미결","paragraphs":["본문"],
                  "properties":[],"reason":"이월","questions":["질문"],"evidenceEntryId":"e1","evidenceQuote":"다음 학년도에는 미결 업무를 별도로 이월합니다."}]}""");

        AnnualService.IncomingEntry source = new AnnualService.IncomingEntry(
                "e1", "plan", "제목", "다음 학년도에는 미결 업무를 별도로 이월합니다.", Map.of());
        AnnualResponse.AnnualItem created = service.renew(List.of(source), 2026).items().stream()
                .filter(item -> item.action().equals("new"))
                .findFirst()
                .orElseThrow();
        assertThat(created.entryId()).isNull();
        assertThat(created.previousTitle()).isEmpty();
    }

    @Test
    void stripsTheQuestionsFromAnItemProposedForRemoval() {
        modelAnswers("""
                {"items":[{"action":"archive","entryId":"e1","category":"plan","title":"올해는 제외","paragraphs":["본문"],
                  "properties":[],"reason":"일회성 업무입니다","questions":["질문1"],"evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."}]}""");

        AnnualResponse.AnnualItem item = service.renew(List.of(entry("e1", "제목")), 2026).items().get(0);
        assertThat(item.questions()).isEmpty();
        assertThat(item.detail()).isEqualTo("<p>본문</p>").doesNotContain("확인이 필요한 내용");
    }

    @Test
    void ordersTheReviewSoTheChangesNeedingAttentionComeFirst() {
        modelAnswers("""
                {"items":[
                  {"action":"keep","entryId":"e1","category":"plan","title":"유지","paragraphs":["본문"],"properties":[],"reason":"r","questions":[],"evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."},
                  {"action":"archive","entryId":"e2","category":"plan","title":"제외","paragraphs":["본문"],"properties":[],"reason":"r","questions":[],"evidenceEntryId":"e2","evidenceQuote":"지난해 본문입니다."},
                  {"action":"new","entryId":"","category":"plan","title":"신규","paragraphs":["본문"],"properties":[],"reason":"r","questions":["q"],"evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."},
                  {"action":"revise","entryId":"e3","category":"plan","title":"수정","paragraphs":["본문"],"properties":[],"reason":"r","questions":["q"],"evidenceEntryId":"e3","evidenceQuote":"지난해 본문입니다."}
                ]}""");

        assertThat(service.renew(List.of(entry("e1", "a"), entry("e2", "b"), entry("e3", "c")), 2026).items())
                .extracting(AnnualResponse.AnnualItem::action)
                .containsExactly("revise", "new", "archive", "keep");
    }

    @Test
    void letsTheReasonNameTheYearTheEntryIsMovingAwayFrom() {
        modelAnswers("""
                {"items":[{"action":"revise","entryId":"e1","category":"plan","title":"2027학년도 체류기간 연장 접수",
                  "paragraphs":["다음 학년도 일정 확인이 필요합니다."],"properties":[],
                  "reason":"2026학년도 기준 연도 표기가 남아 있어 수정했습니다.","questions":[],
                  "evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."}]}""");

        /* The source year is context the model was handed, not a figure it invented — a proposal
         * whose only unrecorded number is the year it is moving away from must survive. */
        assertThat(service.renew(List.of(entry("e1", "체류기간 연장 접수")), 2026).items())
                .extracting(AnnualResponse.AnnualItem::action)
                .containsExactly("revise");
    }

    @Test
    void stillDropsAProposalThatInventsADateTheEntryNeverRecorded() {
        modelAnswers("""
                {"items":[{"action":"revise","entryId":"e1","category":"plan","title":"체류기간 연장 접수",
                  "paragraphs":["9월 5일까지 제출합니다."],"properties":[],"reason":"일정 갱신","questions":[],
                  "evidenceEntryId":"e1","evidenceQuote":"지난해 본문입니다."}]}""");

        /* Dropped, so the entry falls through to the untouched keep the service adds for it. */
        assertThat(service.renew(List.of(entry("e1", "체류기간 연장 접수")), 2026).items())
                .extracting(AnnualResponse.AnnualItem::action)
                .containsExactly("keep");
    }

    @Test
    void keepsTheOriginalTitleAlongsideTheProposedOne() {
        modelAnswers("""
                {"items":[{"action":"revise","entryId":"e1","category":"plan","title":"2027학년도 체류기간 연장 접수",
                  "paragraphs":["본문"],"properties":[],"reason":"연도 갱신","questions":["확정 일정을 알려주세요"],
                  "evidenceEntryId":"e1","evidenceQuote":"2026학년도 체류기간 연장 접수"}]}""");

        AnnualResponse.AnnualItem item = service.renew(List.of(entry("e1", "2026학년도 체류기간 연장 접수")), 2026).items().get(0);
        assertThat(item.previousTitle()).isEqualTo("2026학년도 체류기간 연장 접수");
        assertThat(item.title()).isEqualTo("2027학년도 체류기간 연장 접수");
        assertThat(item.properties()).doesNotContainKey("due");
        assertThat(item.detail()).contains("확인이 필요한 내용");
    }
}
