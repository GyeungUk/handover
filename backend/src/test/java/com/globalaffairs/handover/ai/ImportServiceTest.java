package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
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
    void dropsASecondProposalOfTheSameWorkWithinOneSection() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"체류기간 연장 단체접수 진행","paragraphs":["[업무 개요] 접수를 진행합니다."],
                   "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"},
                  {"category":"plan","title":"체류기간 연장 단체접수 운영","paragraphs":["[처리 절차] 접수를 운영합니다."],
                   "properties":[],"questions":[],"sourceQuote":"9월 중 단체 접수를 신청할 예정입니다","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");

        assertThat(response.items()).extracting(ImportResponse.ImportItem::title)
                .containsExactly("체류기간 연장 단체접수 진행");
        assertThat(response.skipped()).containsExactly(new ImportResponse.Skipped("같은 업무를 다시 제안한 항목", 1));
    }

    @Test
    void keepsTheScheduleOfADutyTheModelPutInItsOwnSection() {
        /* The prompt asks for one duty's dated step as its own plan item; the titles then share
           the duty's own words, and only a section-local check tells that apart from a repeat. */
        modelAnswers("""
                {"items":[
                  {"category":"responsibility","title":"체류기간 연장 단체접수 안내","paragraphs":["[업무 개요] 학생에게 단체접수를 안내합니다."],
                   "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"},
                  {"category":"plan","title":"체류기간 연장 단체접수 일정","paragraphs":["[대상·일정] 9월 중 단체 접수를 신청할 예정입니다."],
                   "properties":[],"questions":[],"sourceQuote":"9월 중 단체 접수를 신청할 예정입니다","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");

        assertThat(response.items()).extracting(ImportResponse.ImportItem::category)
                .containsExactly("responsibility", "plan");
        assertThat(response.skipped()).isEmpty();
    }

    @Test
    void rejectedProposalDoesNotConsumeEvidenceNeededByAValidProposal() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"접수 추진 일정","paragraphs":["999명을 접수합니다."],
                   "properties":[],"questions":[],"sourceQuote":"9월 중 단체 접수를 신청할 예정입니다","confidence":"high"},
                  {"category":"plan","title":"접수 추진 일정","paragraphs":["[대상·일정] 단체접수 신청은 9월 중 진행할 예정입니다."],
                   "properties":[],"questions":[],"sourceQuote":"9월 중 단체 접수를 신청할 예정입니다","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");

        assertThat(response.items()).extracting(ImportResponse.ImportItem::title).containsExactly("접수 추진 일정");
        assertThat(response.skipped()).containsExactly(new ImportResponse.Skipped("원문에 없는 숫자가 들어간 항목", 1));
    }

    @Test
    void rejectedProposalDoesNotReserveATitleWhenTheValidProposalUsesAnotherQuote() {
        modelAnswers("""
                {"items":[
                  {"category":"plan","title":"체류기간 연장 단체접수 진행","paragraphs":["999명을 접수합니다."],
                   "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"},
                  {"category":"plan","title":"체류기간 연장 단체접수 일정","paragraphs":["[대상·일정] 단체접수 신청은 9월 중 진행할 예정입니다."],
                   "properties":[],"questions":[],"sourceQuote":"9월 중 단체 접수를 신청할 예정입니다","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");

        assertThat(response.items()).extracting(ImportResponse.ImportItem::title)
                .containsExactly("체류기간 연장 단체접수 일정");
        assertThat(response.skipped()).containsExactly(new ImportResponse.Skipped("원문에 없는 숫자가 들어간 항목", 1));
    }

    @Test
    void preservesFourDistinctFactsAboutTheSameWorkAcrossAllSections() {
        String source = """
                교환학생 선발 기준을 매 학기 안내한다.
                이번 교환학생 선발 면접은 9월 중 진행한다.
                교환학생 선발시스템 저장 오류가 반복 발생한다.
                교환학생 선발 추가합격 승인은 결재 보류 중이다.
                """;
        modelAnswers("""
                {"items":[
                  {"category":"responsibility","title":"교환학생 선발 기준 안내","paragraphs":["[처리 절차] 학기마다 선발 기준을 안내합니다."],
                   "properties":[],"questions":[],"sourceQuote":"교환학생 선발 기준을 매 학기 안내한다","confidence":"high"},
                  {"category":"plan","title":"교환학생 선발 면접 일정","paragraphs":["[대상·일정] 이번 면접은 9월에 진행합니다."],
                   "properties":[],"questions":[],"sourceQuote":"이번 교환학생 선발 면접은 9월 중 진행한다","confidence":"high"},
                  {"category":"issue","title":"교환학생 선발 저장 오류","paragraphs":["[현재 상태] 선발시스템의 저장 오류가 되풀이되고 있습니다."],
                   "properties":[],"questions":[],"sourceQuote":"교환학생 선발시스템 저장 오류가 반복 발생한다","confidence":"high"},
                  {"category":"pending","title":"교환학생 선발 승인 보류","paragraphs":["[현재 상태] 추가합격을 승인하는 결재가 보류되어 있습니다."],
                   "properties":[],"questions":[],"sourceQuote":"교환학생 선발 추가합격 승인은 결재 보류 중이다","confidence":"high"}
                ],"unmapped":[]}""");

        ImportResponse response = service.classify(source, "a.txt");

        assertThat(response.items()).extracting(ImportResponse.ImportItem::category)
                .containsExactly("responsibility", "plan", "issue", "pending");
        assertThat(response.skipped()).isEmpty();
    }

    /** Replay real model answers through all production filters; never spends API credits in tests. */
    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "IMPORT_EVAL_REPORT", matches = ".+")
    void recordedEvaluationAnswersRetainEveryExpectedFactAfterServiceFiltering() throws Exception {
        var fixtures = new java.util.ArrayList<JsonNode>();
        for (String name : java.util.List.of("classification.json", "advanced-classification.json")) {
            objectMapper.readTree(java.nio.file.Path.of("tools/fixtures/import", name).toFile()).forEach(fixtures::add);
        }
        JsonNode reports = objectMapper.readTree(java.nio.file.Path.of(System.getenv("IMPORT_EVAL_REPORT")).toFile());
        assertThat(reports.size()).isEqualTo(fixtures.size());
        for (JsonNode fixture : fixtures) {
            JsonNode report = reports.valueStream()
                    .filter(candidate -> candidate.path("id").equals(fixture.path("id"))).findFirst().orElseThrow();
            modelAnswers(report.path("answer").toString());
            ImportResponse response = service.classify(fixture.path("source").asText(), fixture.path("id").asText());
            assertThat(response.skipped()).as("%s: accepted facts", fixture.path("id")).isEmpty();
            assertThat(response.items()).hasSize(fixture.path("expected").size());
            var matchedIds = new java.util.HashSet<String>();
            for (JsonNode expected : fixture.path("expected")) {
                var pattern = java.util.regex.Pattern.compile(expected.path("match").asText());
                var matches = response.items().stream()
                        .filter(item -> pattern.matcher(item.title() + " " + item.detail()).find()).toList();
                assertThat(matches)
                        .as("%s / %s", fixture.path("id"), expected.path("id"))
                        .singleElement().extracting(ImportResponse.ImportItem::category)
                        .isEqualTo(expected.path("category").asText());
                var item = matches.get(0);
                assertThat(matchedIds.add(item.id())).as("independent facts must not share one item").isTrue();
                if (expected.has("confidence")) {
                    assertThat(item.confidence()).isEqualTo(expected.path("confidence").asText());
                }
                String prose = item.title() + " " + item.detail().replaceAll("<[^>]+>", " ");
                for (JsonNode required : expected.path("contentMustMatch")) {
                    assertThat(java.util.regex.Pattern.compile(required.asText()).matcher(prose).find())
                            .as("%s: required fact %s", expected.path("id"), required).isTrue();
                }
                for (JsonNode forbidden : expected.path("contentMustNotMatch")) {
                    assertThat(java.util.regex.Pattern.compile(forbidden.asText()).matcher(prose).find())
                            .as("%s: incorrect fact %s", expected.path("id"), forbidden).isFalse();
                }
            }
            for (JsonNode required : fixture.path("unmappedMatch")) {
                assertThat(java.util.regex.Pattern.compile(required.asText())
                        .matcher(String.join(" ", response.unmapped())).find())
                        .as("%s: unclassifiable source %s", fixture.path("id"), required).isTrue();
            }
        }
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

    /* ------------------------------------------------------------ operable work units */

    /** A manual whose facts are all procedure: cycle, steps and control points, with no narrative. */
    private static final String MANUAL = """
            성적처리 인수인계

            1. 성적입력 현황 점검
            학사팀은 입력 기간에 학사정보시스템의 입력 현황을 대조하여 마감을 통제한다.
            미입력 교원이 확인되면 학사팀이 단과대학에 독려를 요청한다.
            반복 미입력 교원이 확인되면 학사팀이 인사팀에 통보한다.

            2. 성적 확정
            교무팀이 최종 성적을 확정하며 학사팀은 확정자료를 보관한다.

            기준 일정표
            | 업무 | 마감 | 담당부서 |
            |---|---|---|
            | 성적입력 현황 점검 | 12월 26일 | 학사팀 |
            | 성적 확정 | 1월 5일 | 교무팀 |
            """;

    private static final String CONTROL_CARD = """
            {"id":"i1","workflowId":"g1","category":"responsibility","title":"성적입력 마감 통제","paragraphs":[],
             "properties":[],"questions":[],"sourceQuote":"학사팀은 입력 기간에 학사정보시스템의 입력 현황을 대조하여 마감을 통제한다",
             "confidence":"high",
             "operation":{"purpose":"입력 마감까지 성적입력 현황을 통제한다","timing":{"cycle":"매 학기","trigger":"입력 기간 시작","deadline":"12월 26일"},
              "collaborators":[{"department":"단과대학","role":"소속 교원 입력 독려"},{"department":"인사팀","role":"반복 미입력 교원 통보 접수"}],
              "resources":{"systems":["학사정보시스템"],"documents":["입력 현황"],"outputs":["마감 확인 결과"]},
              "steps":["입력 현황을 대조한다","미입력을 확인한다"],"prerequisites":["입력 안내"],"followUp":["성적 확정"],
              "controls":[{"condition":"미입력 교원 확인","owner":"학사팀","action":"단과대학에 독려를 요청","escalation":""},
                          {"condition":"반복 미입력 교원 확인","owner":"학사팀","action":"사실을 확인","escalation":"인사팀에 통보"}]},
             "evidence":[{"sourceId":"s2","quote":"미입력 교원이 확인되면 학사팀이 단과대학에 독려를 요청한다"}]}""";

    @Test
    void keepsACardWhoseRecordIsEntirelyOperationWithNoProse() {
        modelAnswers("{\"items\":[" + CONTROL_CARD + "],\"unmapped\":[],"
                + "\"workflowGroups\":[{\"id\":\"g1\",\"title\":\"입력 통제\",\"itemIds\":[\"i1\"],\"after\":[]}]}");

        ImportResponse.ImportItem item = service.classify(MANUAL, "매뉴얼.docx").items().get(0);

        assertThat(item.operation()).isNotNull();
        assertThat(item.operation().controls()).hasSize(2);
        assertThat(item.detail())
                .contains("업무 목적").contains("주기·시작·마감").contains("12월 26일")
                .contains("협업 부서와 역할").contains("학사정보시스템")
                .contains("실행 절차").contains("주의사항·통제 포인트")
                .contains("<td>반복 미입력 교원 확인</td>").contains("<td>인사팀에 통보</td>");
    }

    @Test
    void dropsACardThatCarriesNeitherProseNorOperation() {
        modelAnswers("""
                {"items":[{"id":"i1","category":"plan","title":"제목만 있는 항목","paragraphs":[],
                  "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high",
                  "operation":{"purpose":"","timing":{"cycle":"","trigger":"","deadline":""},"collaborators":[],
                   "resources":{"systems":[],"documents":[],"outputs":[]},"steps":[],"prerequisites":[],
                   "followUp":[],"controls":[]},"evidence":[]}],"unmapped":[]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");

        assertThat(response.items()).isEmpty();
        assertThat(response.skipped()).containsExactly(new ImportResponse.Skipped("형식이 불완전한 항목", 1));
    }

    @Test
    void rejectsAnEscalationThresholdTheSourceNeverRecorded() {
        /* "반복" in the source sets no count. A control that supplies one invents the rule. */
        modelAnswers("""
                {"items":[{"id":"i1","category":"responsibility","title":"성적입력 마감 통제","paragraphs":[],
                  "properties":[],"questions":[],"sourceQuote":"반복 미입력 교원이 확인되면 학사팀이 인사팀에 통보한다","confidence":"high",
                  "operation":{"purpose":"입력 마감을 통제한다","timing":{"cycle":"","trigger":"","deadline":""},"collaborators":[],
                   "resources":{"systems":[],"documents":[],"outputs":[]},"steps":[],"prerequisites":[],"followUp":[],
                   "controls":[{"condition":"3회 이상 미입력","owner":"학사팀","action":"인사팀에 통보","escalation":""}]},
                  "evidence":[]}],"unmapped":[]}""");

        ImportResponse response = service.classify(MANUAL, "매뉴얼.docx");

        assertThat(response.items()).isEmpty();
        assertThat(response.skipped()).containsExactly(new ImportResponse.Skipped("원문에 없는 숫자가 들어간 항목", 1));
    }

    @Test
    void combinesTheCardsIntoWorkPhasesInDependencyOrder() {
        modelAnswers("""
                {"items":[
                  {"id":"i1","workflowId":"g2","category":"responsibility","title":"성적 확정 요청","paragraphs":["[처리 절차] 확정을 요청합니다."],
                   "properties":[],"questions":[],"sourceQuote":"교무팀이 최종 성적을 확정하며","confidence":"high"},
                  {"id":"i2","workflowId":"g1","category":"responsibility","title":"성적입력 마감 통제","paragraphs":["[처리 절차] 입력 현황을 대조합니다."],
                   "properties":[],"questions":[],"sourceQuote":"학사팀은 입력 기간에 학사정보시스템의 입력 현황을 대조","confidence":"high"}],
                 "unmapped":[],
                 "workflowGroups":[
                   {"id":"g2","title":"성적 확정","itemIds":["i1"],"after":["g1"]},
                   {"id":"g1","title":"입력 통제","itemIds":["i2"],"after":[]}]}""");

        ImportResponse response = service.classify(MANUAL, "매뉴얼.docx");

        assertThat(response.workflowGroups()).extracting(ImportResponse.WorkflowGroup::title)
                .containsExactly("입력 통제", "성적 확정");
        assertThat(response.workflowGroups().get(0).after()).isEmpty();
        assertThat(response.workflowGroups().get(1).after())
                .containsExactly(response.workflowGroups().get(0).id());
        /* Every card names the phase it runs in, so the modal never has to guess. */
        assertThat(response.items()).allSatisfy(item -> assertThat(item.workflowId()).isNotBlank());
        assertThat(response.verification().warnings()).isEmpty();
    }

    @Test
    void mergesTheSamePhaseProposedByTwoPartsOfOneDocument() {
        /* Every part of a split document gets the same stubbed answer, ids and all. */
        modelAnswers("""
                {"items":[{"id":"i1","workflowId":"g1","category":"responsibility","title":"체류기간 연장 단체접수 안내",
                  "paragraphs":["[처리 절차] 단체접수를 안내합니다."],"properties":[],"questions":[],
                  "sourceQuote":"체류기간 연장 단체접수","confidence":"high"}],"unmapped":[],
                 "workflowGroups":[{"id":"g1","title":"체류 연장 접수 운영","itemIds":["i1"],"after":[]}]}""");

        String long_ = "체류기간 연장 단체접수를 진행합니다. 출입국관리사무소와 협의하여 접수합니다.\n\n".repeat(400);
        ImportResponse response = service.classify(long_, "인수인계.docx");

        assertThat(ImportService.chunk(long_.trim())).hasSizeGreaterThan(1);
        assertThat(response.workflowGroups()).singleElement()
                .extracting(ImportResponse.WorkflowGroup::title).isEqualTo("체류 연장 접수 운영");
        assertThat(response.workflowGroups().get(0).itemIds()).containsExactly("import-0");
    }

    @Test
    void breaksAndReportsPhasesThatDependOnEachOther() {
        modelAnswers("""
                {"items":[
                  {"id":"i1","workflowId":"g1","category":"responsibility","title":"성적입력 마감 통제","paragraphs":["[처리 절차] 대조합니다."],
                   "properties":[],"questions":[],"sourceQuote":"학사팀은 입력 기간에 학사정보시스템의 입력 현황을 대조","confidence":"high"},
                  {"id":"i2","workflowId":"g2","category":"responsibility","title":"성적 확정 요청","paragraphs":["[처리 절차] 확정을 요청합니다."],
                   "properties":[],"questions":[],"sourceQuote":"교무팀이 최종 성적을 확정하며","confidence":"high"}],
                 "unmapped":[],
                 "workflowGroups":[
                   {"id":"g1","title":"입력 통제","itemIds":["i1"],"after":["g2"]},
                   {"id":"g2","title":"성적 확정","itemIds":["i2"],"after":["g1"]}]}""");

        ImportResponse response = service.classify(MANUAL, "매뉴얼.docx");

        assertThat(response.workflowGroups()).hasSize(2);
        assertThat(response.verification().warnings())
                .anyMatch(warning -> warning.contains("순환"));
    }

    /* ------------------------------------------------------------ source coverage */

    @Test
    void numbersEveryParagraphAndEveryScheduleRowSeparately() {
        var segments = ImportService.segments(ImportService.chunk(MANUAL.strip())).get(0);

        assertThat(segments).extracting(ImportService.Segment::id).startsWith("s1", "s2", "s3");
        /* Each row of the schedule is its own unit, and the rule under the header is not one. */
        assertThat(segments).extracting(ImportService.Segment::text)
                .contains("| 성적입력 현황 점검 | 12월 26일 | 학사팀 |", "| 성적 확정 | 1월 5일 | 교무팀 |")
                .doesNotContain("|---|---|---|");
    }

    @Test
    void sendsTheSourceToTheModelAsNumberedUnits() {
        java.util.List<String> chunks = ImportService.chunk(MANUAL.strip());
        String message = ImportService.userMessage("{}", "매뉴얼.docx", chunks, ImportService.segments(chunks), 0);

        assertThat(message)
                .contains("<조각 id=\"s1\">")
                .contains("<조각 id=\"s2\">\n1. 성적입력 현황 점검")
                .contains("| 성적 확정 | 1월 5일 | 교무팀 |\n</조각>");
    }

    @Test
    void reportsTheScheduleRowNoSurvivingCardWasBuiltOn() {
        modelAnswers("""
                {"items":[{"id":"i1","workflowId":"g1","category":"responsibility","title":"성적입력 마감 통제",
                  "paragraphs":["[처리 절차] 입력 현황을 대조합니다."],"properties":[],"questions":[],
                  "sourceQuote":"학사팀은 입력 기간에 학사정보시스템의 입력 현황을 대조","confidence":"high",
                  "evidence":[{"sourceId":"s6","quote":"| 성적입력 현황 점검 | 12월 26일 | 학사팀 |"}]}],
                 "unmapped":[],
                 "workflowGroups":[{"id":"g1","title":"입력 통제","itemIds":["i1"],"after":[]}],
                 "coverage":[{"sourceId":"s1","itemIds":[],"reason":"문서 제목입니다."}]}""");

        ImportResponse.Verification verification = service.classify(MANUAL, "매뉴얼.docx").verification();

        assertThat(verification.sourceCount()).isGreaterThan(verification.coveredCount());
        /* The row the card cited is credited; the row for a phase nobody wrote is reported. */
        assertThat(verification.uncovered()).extracting(ImportResponse.Uncovered::excerpt)
                .anyMatch(excerpt -> excerpt.contains("성적 확정 | 1월 5일"))
                .noneMatch(excerpt -> excerpt.contains("성적입력 현황 점검 | 12월 26일"));
        /* A unit the model explained keeps its explanation instead of reading as an omission. */
        assertThat(verification.uncovered()).anySatisfy(entry ->
                assertThat(entry.reason()).isEqualTo("문서 제목입니다."));
    }

    @Test
    void doesNotCreditAUnitOnEvidenceThatFailedTheAcceptanceChecks() {
        /* The card is dropped for an invented number, so the paragraph it cited stays unreflected
           rather than being covered by a claim that did not survive. */
        modelAnswers("""
                {"items":[{"id":"i1","category":"responsibility","title":"성적 확정","paragraphs":["[처리 절차] 999건을 확정합니다."],
                  "properties":[],"questions":[],"sourceQuote":"교무팀이 최종 성적을 확정하며","confidence":"high",
                  "evidence":[{"sourceId":"s3","quote":"교무팀이 최종 성적을 확정하며 학사팀은 확정자료를 보관한다"}]}],
                 "unmapped":[],"workflowGroups":[],
                 "coverage":[{"sourceId":"s3","itemIds":["i1"],"reason":"성적 확정 업무에 반영했습니다."}]}""");

        ImportResponse response = service.classify(MANUAL, "매뉴얼.docx");

        assertThat(response.items()).isEmpty();
        assertThat(response.verification().coveredCount()).isZero();
        assertThat(response.verification().uncovered()).extracting(ImportResponse.Uncovered::excerpt)
                .anyMatch(excerpt -> excerpt.contains("교무팀이 최종 성적을 확정하며"));
    }

    @Test
    void ignoresAUnitNumberTheServiceNeverIssued() {
        modelAnswers("""
                {"items":[{"id":"i1","category":"plan","title":"체류기간 연장 단체접수","paragraphs":["[업무 개요] 접수를 진행합니다."],
                  "properties":[],"questions":[],"sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high",
                  "evidence":[{"sourceId":"s999","quote":"원문에 없는 인용입니다"}]}],
                 "unmapped":[],"coverage":[{"sourceId":"s999","itemIds":["i1"],"reason":"반영했습니다."}]}""");

        ImportResponse response = service.classify(SOURCE, "a.txt");

        /* The ungrounded quote is dropped, the item keeps the evidence it could prove. */
        assertThat(response.items().get(0).evidence()).hasSize(1);
        assertThat(response.items().get(0).evidence().get(0).quote()).isEqualTo("2학기 체류기간 연장 단체접수");
        assertThat(response.verification().warnings()).anyMatch(warning -> warning.contains("조각 번호"));
    }

    @Test
    void keepsEveryOpenQuestionTheSchemaAllows() {
        modelAnswers("""
                {"items":[{"id":"i1","category":"plan","title":"체류기간 연장 단체접수","paragraphs":["[업무 개요] 접수를 진행합니다."],
                  "properties":[],
                  "questions":["첫째 질문입니까?","둘째 질문입니까?","셋째 질문입니까?","넷째 질문입니까?",
                               "다섯째 질문입니까?","여섯째 질문입니까?","일곱째 질문입니까?","여덟째 질문입니까?","아홉째 질문입니까?"],
                  "sourceQuote":"2학기 체류기간 연장 단체접수","confidence":"high"}],"unmapped":[]}""");

        assertThat(service.classify(SOURCE, "a.txt").items().get(0).questions()).hasSize(8);
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
