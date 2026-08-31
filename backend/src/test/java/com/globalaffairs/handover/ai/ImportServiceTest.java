package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.ai.dto.ImportResponse;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/** Sorting an uploaded document into the four sections, and what has to be true to keep an item. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ImportServiceTest {

    private static final String SOURCE = """
            2학기 체류기간 연장 단체접수를 진행 중입니다.
            출입국관리사무소와 협의하여 9월 중 단체 접수를 신청할 예정입니다.
            장학금 심사는 아직 시작하지 않았습니다.
            """;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private OpenAiClient openAiClient;

    private ImportService service;

    @BeforeEach
    void setUp() {
        HandoverSchema schema = new HandoverSchema(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, new OrgData(objectMapper));
        service = new ImportService(
                schema, openAiClient, new AiResources(objectMapper, schema, calendar), new AiSupport(schema), new JsonStringify(objectMapper));
    }

    private void modelAnswers(String json) {
        try {
            when(openAiClient.ask(anyString(), anyString(), any(), anyString(), anyString()))
                    .thenReturn(objectMapper.readTree(json));
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    @Test
    void refusesASourceTooShortToBeWorthClassifying() {
        assertThatThrownBy(() -> service.classify("짧은 내용", "a.txt"))
                .isInstanceOf(ApiException.class)
                .hasMessage("읽을 내용이 너무 짧습니다. 자료를 다시 올리거나 내용을 붙여넣어 주세요.");
        assertThatThrownBy(() -> service.classify(null, null))
                .hasMessage("읽을 내용이 너무 짧습니다. 자료를 다시 올리거나 내용을 붙여넣어 주세요.");
    }

    @Test
    void keepsOnlyItemsWhoseEvidenceQuoteReallyAppearsInTheUploadedText() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"체류기간 연장 단체접수","paragraphs":["진행 중입니다."],
                   "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"},
                  {"category":"issue","title":"지어낸 근거","paragraphs":["본문"],
                   "properties":[],"questions":[],"sourceQuote":"원문에 없는 문장입니다","confidence":"low"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "인수인계.docx");

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).sourceQuote()).isEqualTo("2학기 체류기간 연장 단체접수");
    }

    @Test
    void refusesToSilentlyCutOffAnOversizedSource() {
        assertThatThrownBy(() -> service.classify("가".repeat(100001), "large.txt"))
                .isInstanceOf(ApiException.class)
                .hasMessage("정확한 분류를 위해 자료를 100,000자 이하로 나누어 올려 주세요.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE);
    }

    @Test
    void keepsOneItemWhenTheModelReusesTheSameEvidenceForTwoClaims() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"접수 계획","paragraphs":["본문"],"properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"},
                  {"category":"issue","title":"접수 현안","paragraphs":["본문"],"properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"low"}
                ],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").items()).hasSize(1);
    }

    @Test
    void returnsItemsInDocumentSectionOrderRegardlessOfTheOrderTheModelUsed() {
        modelAnswers("""
                {"items":[
                  {"category":"pending","title":"미결","paragraphs":["본문"],"properties":[],"questions":[],"sourceQuote":"장학금 심사는 아직 시작하지 않았습니다","confidence":"low"},
                  {"category":"responsibility","title":"담당","paragraphs":["본문"],"properties":[],"questions":[],"sourceQuote":"출입국관리사무소와 협의하여","confidence":"high"},
                  {"category":"issue","title":"현안","paragraphs":["본문"],"properties":[],"questions":[],"sourceQuote":"9월 중 단체 접수를 신청할 예정입니다","confidence":"low"}
                ],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").items())
                .extracting(ImportResponse.ImportItem::category)
                .containsExactly("responsibility", "issue", "pending");
    }

    @Test
    void dropsTheFillerAModelWritesInsteadOfAnEmptyLeftoverList() {
        modelAnswers("""
                {"items":[{"category":"plan","title":"제목","paragraphs":["본문"],
                  "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}],
                 "unmapped":["없음","해당 없음","-","진짜 남은 내용","두 번째 남은 내용","세 번째","네 번째","다섯 번째"]}""");

        assertThat(service.classify(SOURCE, "a.txt").unmapped())
                .containsExactly("진짜 남은 내용", "두 번째 남은 내용", "세 번째", "네 번째", "다섯 번째");
    }

    @Test
    void reportsTheFileNameAndCharacterCountTheCardHeaderShows() {
        modelAnswers("{\"items\":[],\"unmapped\":[]}");

        ImportResponse response = service.classify(SOURCE, "2026 인수인계.docx");

        assertThat(response.fileName()).isEqualTo("2026 인수인계.docx");
        assertThat(response.charCount()).isEqualTo(SOURCE.trim().length());
        /* The section labels travel with the response, as they did from the Worker. */
        assertThat(response.sections()).containsEntry("plan", "주요업무계획 및 진행사항");
    }

    @Test
    void namesPastedContentWhenNoFileNameWasSent() {
        modelAnswers("{\"items\":[],\"unmapped\":[]}");
        assertThat(service.classify(SOURCE, null).fileName()).isEqualTo("붙여넣은 내용");
    }

    @Test
    void treatsAnyConfidenceOtherThanHighAsLow() {
        modelAnswers("""
                {"items":[{"category":"plan","title":"제목","paragraphs":["본문"],
                  "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"maybe"}],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").items().get(0).confidence()).isEqualTo("low");
    }

    @Test
    void acceptsEveryPropertyTheSectionDefinesUnlikeTheDraftRoute() {
        modelAnswers("""
                {"items":[{"category":"plan","title":"제목","paragraphs":["본문"],
                  "properties":[{"key":"due","value":"2026. 09. 06"},{"key":"progress","value":"50%"}],
                  "questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}],"unmapped":[]}""");

        assertThat(service.classify(SOURCE + "\n목표 일정은 2026. 09. 06이며 진행률은 50%입니다.", "a.txt").items().get(0).properties())
                .containsEntry("due", "2026. 09. 06")
                .containsEntry("progress", "50%");
    }
}
