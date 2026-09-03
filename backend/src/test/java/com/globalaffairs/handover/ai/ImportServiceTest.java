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

    /** What a 45-page orientation deck looks like once a converter has turned it into Markdown. */
    private static final String SLIDE_DECK = """
            ### 파견교환학생
            ### 오리엔테이션
            **파견 전** **1**
            #### INDEX
            **2** **파견 중 유의사항**
            #### 파견전서류준비
            #### 현재진행상황
            예비합격이 된 후 오리엔테이션까지 끝나면 상대학교에 지명 절차를 진행하며 8월 31일부터 상대교에 지명절차를 진행할 예정입니다.
            상대교에서 Application Process를 학생에게 직접 메일로 발송하며 국제팀은 10월 중 학생들에게 별도로 연락할 예정입니다.
            """;

    @Test
    void dropsTheItemAModelBuildsByPastingTheSlideDeckItWasGiven() {
        /* Both older checks pass for a paste: it quotes itself, and it invents no number. */
        modelAnswers("""
                {"items":[
                  {"category":"responsibility","title":"### 파견교환학생 ### 오리엔테이션 **파견 전** **1** ####",
                   "paragraphs":["### 파견교환학생 ### 오리엔테이션 **파견 전** **1** #### INDEX **2** **파견 중 유의사항** #### 파견전서류준비 #### 현재진행상황 예비합격"],
                   "properties":[],"questions":[],"sourceQuote":"### 파견교환학생","confidence":"high"}
                ],"unmapped":[]}""");

        assertThat(service.classify(SLIDE_DECK, "오리엔테이션.pdf").items()).isEmpty();
    }

    @Test
    void dropsAnItemThatReproducesAnUnbrokenRunOfTheSourceWithoutAnyMarkup() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"파견 전 지명 절차 진행",
                   "paragraphs":["[처리 절차] 예비합격이 된 후 오리엔테이션까지 끝나면 상대학교에 지명 절차를 진행하며 8월 31일부터 상대교에 지명절차를 진행할 예정입니다. 상대교에서 Application Process를 학생에게 직접 메일로 발송하며 국제팀은 10월 중 학생들에게 별도로 연락할 예정입니다."],
                   "properties":[],"questions":[],"sourceQuote":"예비합격이 된 후","confidence":"high"}
                ],"unmapped":[]}""");

        assertThat(service.classify(SLIDE_DECK, "오리엔테이션.pdf").items()).isEmpty();
    }

    @Test
    void keepsTheRewrittenItemFromTheSameDeckAndLeavesNoMarkerInIt() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"파견 전 상대교 지명 절차 진행",
                   "paragraphs":["[업무 개요] 예비합격자를 대상으로 상대교 지명 절차를 진행합니다.",
                                 "[대상·일정] 8월 31일부터 상대교에 지명 절차를 신청할 예정입니다."],
                   "properties":[],"questions":[],"sourceQuote":"예비합격이 된 후","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse.ImportItem item = service.classify(SLIDE_DECK, "오리엔테이션.pdf").items().get(0);

        assertThat(item.title()).isEqualTo("파견 전 상대교 지명 절차 진행");
        assertThat(item.detail()).doesNotContain("#").doesNotContain("**").contains("업무 개요");
    }

    @Test
    void cleansAStrayMarkerOutOfAnItemItStillKeeps() {
        /* One asterisk is not evidence of a paste, so the item stays and is tidied instead. */
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"입학허가서 수령 안내 *",
                   "paragraphs":["[업무 개요] 학생에게 입학허가서 수령 절차를 안내합니다."],
                   "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}
                ],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").items().get(0).title()).isEqualTo("입학허가서 수령 안내");
    }

    @Test
    void namesEveryReasonAProposalNeverBecameACard() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"근거 없는 항목","paragraphs":["[업무 개요] 내용입니다."],
                   "properties":[],"questions":[],"sourceQuote":"원문에 없는 문장입니다","confidence":"high"},
                  {"category":"plan","title":"숫자를 지어낸 항목","paragraphs":["[대상·일정] 999명을 대상으로 진행합니다."],
                   "properties":[],"questions":[],"sourceQuote":"예비합격이 된 후","confidence":"high"},
                  {"category":"plan","title":"붙여넣은 항목",
                   "paragraphs":["[처리 절차] 예비합격이 된 후 오리엔테이션까지 끝나면 상대학교에 지명 절차를 진행하며 8월 31일부터 상대교에 지명절차를 진행할 예정입니다. 상대교에서 Application Process를 학생에게 직접 메일로 발송하며 국제팀은 10월 중 학생들에게 별도로 연락할 예정입니다."],
                   "properties":[],"questions":[],"sourceQuote":"상대교에서 Application","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(SLIDE_DECK, "오리엔테이션.pdf");

        assertThat(response.items()).isEmpty();
        assertThat(response.skipped()).containsExactly(
                new ImportResponse.Skipped("원문에서 근거 구절을 확인하지 못한 항목", 1),
                new ImportResponse.Skipped("원문에 없는 숫자가 들어간 항목", 1),
                new ImportResponse.Skipped("원문을 그대로 옮긴 항목", 1));
    }

    @Test
    void countsTwoRejectionsOfTheSameKindTogether() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"첫 번째","paragraphs":["본문"],
                   "properties":[],"questions":[],"sourceQuote":"원문에 없는 문장입니다","confidence":"high"},
                  {"category":"issue","title":"두 번째","paragraphs":["본문"],
                   "properties":[],"questions":[],"sourceQuote":"이것도 원문에 없습니다","confidence":"low"}
                ],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").skipped())
                .containsExactly(new ImportResponse.Skipped("원문에서 근거 구절을 확인하지 못한 항목", 2));
    }

    @Test
    void reportsNoRejectionWhenEveryProposalSurvives() {
        modelAnswers("""
                {"items":[{"category":"plan","title":"체류기간 연장 단체접수","paragraphs":["[업무 개요] 접수를 진행합니다."],
                  "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").skipped()).isEmpty();
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
    void keepsAShortPasteAsOneCallSoNothingAboutItChanges() {
        assertThat(ImportService.chunk(SOURCE)).containsExactly(SOURCE);
    }

    @Test
    void splitsALongDocumentAtBlankLinesRatherThanMidSentence() {
        String block = "체류기간 연장 단체접수를 진행합니다. 출입국관리사무소와 협의하여 접수합니다.\n\n";
        java.util.List<String> parts = ImportService.chunk(block.repeat(400).strip());

        assertThat(parts).hasSizeGreaterThan(1).hasSizeLessThanOrEqualTo(8);
        assertThat(parts).allSatisfy(part -> assertThat(part).doesNotEndWith("출입국관리사무소와"));
        /* Nothing is lost or duplicated between the parts. */
        assertThat(String.join("\n\n", parts).replaceAll("\\s+", ""))
                .isEqualTo(block.repeat(400).replaceAll("\\s+", ""));
    }

    @Test
    void asksAboutEveryPartOfALongDocumentAndNeverAboutMoreThanEight() {
        assertThat(ImportService.chunk("가".repeat(100000))).hasSize(8);
    }

    @Test
    void keepsOneConvertedTableTogetherAcrossABlankAndRepeatedHeader() {
        String row = "|1|1조|7/22 (수)|10:20|20240001|학생|University of Example|\n";
        String header = "2027-1학기 파견교환학생 면접 일정\n|연번|조|면접일자|면접시간|학번|이름|1지망 대학|\n|---|---|---|---|---|---|---|\n";
        String source = header + row.repeat(90) + "\n" + header + row.repeat(90);

        assertThat(source.length()).isGreaterThan(9000);
        assertThat(ImportService.chunk(source)).containsExactly(source);
    }

    @Test
    void keepsOnlyTheFirstOfTwoPartsProposingTheSameWork() {
        /* Every part of one document gets the same stubbed answer, which is the seam case exactly. */
        modelAnswers("""
                {"items":[{"category":"plan","title":"체류기간 연장 단체접수","paragraphs":["[업무 개요] 접수를 진행합니다."],
                  "properties":[],"questions":[],"sourceQuote":"체류기간 연장 단체접수","confidence":"high"}],"unmapped":["남은 내용"]}""");

        String long_ = "체류기간 연장 단체접수를 진행합니다. 출입국관리사무소와 협의하여 접수합니다.\n\n".repeat(400);
        ImportResponse response = service.classify(long_, "인수인계.docx");

        assertThat(response.items()).hasSize(1);
        assertThat(response.unmapped()).containsExactly("남은 내용");
        assertThat(response.skipped())
                .contains(new ImportResponse.Skipped("같은 원문 구절을 다시 사용한 항목", ImportService.chunk(long_.trim()).size() - 1));
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
    void keepsOnlyEvidenceSafeImportPropertiesThatTheSourceActuallyRecords() {
        modelAnswers("""
                {"items":[{"category":"plan","title":"제목","paragraphs":["본문"],
                  "properties":[{"key":"due","value":"2026. 09. 06"},{"key":"progress","value":"50%"},{"key":"priority","value":"높음"}],
                  "questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}],"unmapped":[]}""");

        assertThat(service.classify(SOURCE + "\n목표 일정은 2026. 09. 06이며 진행률은 50%입니다.", "a.txt").items().get(0).properties())
                .containsEntry("due", "2026. 09. 06")
                .containsEntry("progress", "50%");
    }

    @Test
    void ignoresAnInventedNumberInsideAPropertyTheImportDoesNotAllow() {
        modelAnswers("""
                {"items":[{"category":"plan","title":"체류기간 연장 단체접수","paragraphs":["[업무 개요] 접수를 진행합니다."],
                  "properties":[{"key":"priority","value":"999순위"}],
                  "questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).properties()).isEmpty();
    }
}
