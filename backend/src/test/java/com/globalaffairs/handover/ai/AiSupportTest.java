package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.HandoverSchema;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    void rejectsNumbersTheModelCouldNotHaveReadFromTheSource() {
        String source = "84명 중 71명을 검토했고 목표일은 2026.09.06입니다.";

        assertThat(AiSupport.usesOnlyRecordedNumbers("71명을 검토했습니다.", source, Set.of())).isTrue();
        assertThat(AiSupport.usesOnlyRecordedNumbers("72명을 검토했습니다.", source, Set.of())).isFalse();
        assertThat(AiSupport.usesOnlyRecordedNumbers("2027학도로 갱신합니다.", source, Set.of("2027"))).isTrue();
    }

    @Test
    void acceptsAFigureTheModelReadOutOfPunctuationTheSourceUsed() {
        String source = "2027-1학기 면접 일정 (7/22~23, 전체 140명)";

        assertThat(AiSupport.usesOnlyRecordedNumbers("2027학년도 1학기 면접", source, Set.of())).isTrue();
        assertThat(AiSupport.usesOnlyRecordedNumbers("7월 22일과 23일에 진행합니다.", source, Set.of())).isTrue();
        assertThat(AiSupport.usesOnlyRecordedNumbers("7월 24일에 진행합니다.", source, Set.of())).isFalse();
        /* A run is compared whole, so digits cannot be recombined into a figure nobody wrote. */
        assertThat(AiSupport.usesOnlyRecordedNumbers("202명이 참석합니다.", source, Set.of())).isFalse();
    }

    @Test
    void findsAQuoteBackInTheSourceEvenWhenTheModelMovedTheSpaces() {
        String source = AiSupport.normalize("상대교 수학 종료 후 2 주 내 복귀하도록 안내합니다.");

        assertThat(AiSupport.groundedQuote("2 주 내 복귀", source)).isEqualTo("2 주 내 복귀");
        /* The source's own spacing comes back, not the model's. */
        assertThat(AiSupport.groundedQuote("2주 내 복귀", source)).isEqualTo("2 주 내 복귀");
        assertThat(AiSupport.groundedQuote("3주 내 복귀", source)).isEmpty();
        assertThat(AiSupport.groundedQuote("   ", source)).isEmpty();
    }

    @Test
    void recoversTheSourcesOwnQuoteWhenOnlyConverterPunctuationWasOmitted() {
        String source = AiSupport.normalize(
                "보험증권(영문) 파견 직전 구글폼으로 전달 / 상대교 기숙사 입사일/오리엔테이션 일자를 기준으로 항공권 예매");

        assertThat(AiSupport.groundedQuote("보험증권 영문 파견 직전 구글폼으로 전달", source))
                .isEqualTo("보험증권(영문) 파견 직전 구글폼으로 전달");
        assertThat(AiSupport.groundedQuote("기숙사 입사일 오리엔테이션 일자를 기준으로 항공권 예매", source))
                .isEqualTo("기숙사 입사일/오리엔테이션 일자를 기준으로 항공권 예매");
        assertThat(AiSupport.groundedQuote("입학허가서 발급일은 대학별로 다름", source)).isEmpty();
    }

    @Test
    void tellsTwoNamesForOneJobApartFromTwoJobsWithSimilarNames() {
        /* The pair two parts of one split timetable produced. */
        assertThat(AiSupport.titleOverlap("파견교환학생 면접시간표 확인", "파견교환학생 면접시간표 운영"))
                .isGreaterThanOrEqualTo(AiSupport.SAME_WORK);
        /* The closest pair of genuinely different items measured across the same documents. */
        assertThat(AiSupport.titleOverlap("귀국보고 및 학점전환 신청", "귀국 후 학점전환 신청 처리"))
                .isLessThan(AiSupport.SAME_WORK);
        assertThat(AiSupport.titleOverlap("파견 항공권 예매 안내", "파견 보험 가입 및 증권 제출 안내"))
                .isLessThan(AiSupport.SAME_WORK);
        assertThat(AiSupport.titleOverlap("같은 제목", "같은 제목")).isEqualTo(1);
    }

    @Test
    void buildsTheEntryBodyWithTheQuestionListOnlyWhenThereAreQuestions() {
        assertThat(AiSupport.detailHtml(List.of("첫 문단", "둘째 문단"), List.of()))
                .isEqualTo("<p>첫 문단</p><p>둘째 문단</p>");
        assertThat(AiSupport.detailHtml(List.of("본문"), List.of("담당자는 누구입니까?")))
                .isEqualTo("<p>본문</p><p><strong>확인이 필요한 내용</strong></p><ul><li>담당자는 누구입니까?</li></ul>");
    }

    @Test
    void rendersStructuredParagraphLabelsAsSafeHeadings() {
        assertThat(AiSupport.detailHtml(
                        List.of("[업무 개요] 체류 연장 접수를 진행합니다.", "[인계 포인트]"),
                        List.of()))
                .isEqualTo("<p><strong>업무 개요</strong><br>체류 연장 접수를 진행합니다.</p>"
                        + "<p><strong>인계 포인트</strong></p>");
    }

    @Test
    void canonicalizesImportParagraphLabelsMergesDuplicatesAndRestoresTheirOrder() {
        assertThat(AiSupport.importParagraphs(List.of(
                        "[주의사항] 제출 후에는 취소할 수 없습니다.",
                        "[준비 자료] 성적표를 준비합니다.",
                        "[처리 절차] 시스템에 입력합니다.",
                        "[업무 개요] 학점전환을 관리합니다.",
                        "[협업 절차] 학사팀 승인을 받습니다.")))
                .containsExactly(
                        "[업무 개요] 학점전환을 관리합니다.",
                        "[처리 절차] 성적표를 준비합니다. 시스템에 입력합니다. 학사팀 승인을 받습니다.",
                        "[주의사항] 제출 후에는 취소할 수 없습니다.");
    }

    @Test
    void givesUnlabeledOrUnknownImportProseASafeContractLabelWithoutLosingIt() {
        assertThat(AiSupport.importParagraphs(List.of(
                        "담당자가 신청을 검토합니다.",
                        "[새 라벨] 후임자가 결과를 확인합니다.")))
                .containsExactly(
                        "[업무 개요] 담당자가 신청을 검토합니다.",
                        "[인계 포인트] 후임자가 결과를 확인합니다.");
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
    void keepsOnlyImportOptionsActuallyWrittenInTheSourceAndCapsFreeTextValues() {
        List<AiSupport.PropertyPair> pairs = List.of(
                new AiSupport.PropertyPair("cycle", "학기별"),
                new AiSupport.PropertyPair("department", "국제교류팀"),
                new AiSupport.PropertyPair("importance", "핵심"));

        assertThat(support.cleanImportProperties(
                        "responsibility", pairs, "국제교류팀과 매월 확인합니다.", key -> !key.equals("importance")))
                .containsExactlyEntriesOf(Map.of("department", "국제교류팀"));
        assertThat(support.cleanImportProperties(
                        "responsibility", pairs, "국제교류팀과 학기별로 확인합니다. 중요도는 핵심입니다.", key -> true))
                .containsExactlyInAnyOrderEntriesOf(Map.of(
                        "cycle", "학기별", "department", "국제교류팀", "importance", "핵심"));
        assertThat(support.cleanImportProperties(
                        "responsibility",
                        List.of(new AiSupport.PropertyPair("department", "매우 긴 부서 이름".repeat(3))),
                        "매우 긴 부서 이름".repeat(3),
                        key -> true))
                .isEmpty();
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
    void recognisesTheConverterMarkupAKoreanOfficeSentenceWouldNeverContain() {
        assertThat(AiSupport.carriesExtractionMarkup("### 파견교환학생 ### 오리엔테이션 **파견 전** **1** ####")).isTrue();
        assertThat(AiSupport.carriesExtractionMarkup("► 상대교에서 메일을 발송합니다.")).isTrue();
        assertThat(AiSupport.carriesExtractionMarkup("체류기간 연장 단체접수를 진행합니다.")).isFalse();
        /* A hash inside a word is a real character, not a heading marker. */
        assertThat(AiSupport.carriesExtractionMarkup("C#으로 작성된 시스템입니다.")).isFalse();
        assertThat(AiSupport.carriesExtractionMarkup(null)).isFalse();
    }

    @Test
    void stripsThoseMarkersButKeepsTheWordsTheyWrapped() {
        assertThat(AiSupport.stripExtractionMarkup("### 파견교환학생 ### 오리엔테이션 **파견 전** **1** ####"))
                .isEqualTo("파견교환학생 오리엔테이션 파견 전 1");
        assertThat(AiSupport.stripExtractionMarkup("► 여권 사전 발급 해 놓을 것")).isEqualTo("여권 사전 발급 해 놓을 것");
        assertThat(AiSupport.stripExtractionMarkup(null)).isEmpty();
    }

    @Test
    void tellsAPastedSourceRunApartFromAParaphraseOfTheSameFacts() {
        String source = AiSupport.normalize("""
                예비합격이 된 후 오리엔테이션까지 끝나면 상대학교에 지명 절차를 진행하며
                8월 31일부터 상대교에 지명절차를 진행할 예정입니다. 상대교에서 학생에게 직접 메일을 발송합니다.
                """);

        assertThat(AiSupport.looksCopiedFrom(
                        "예비합격이 된 후 오리엔테이션까지 끝나면 상대학교에 지명 절차를 진행하며 8월 31일부터 상대교에 지명절차를 진행할 예정입니다. 상대교에서 학생에게 직접 메일을 발송합니다.",
                        source))
                .isTrue();
        assertThat(AiSupport.looksCopiedFrom(
                        "[처리 절차] 예비합격자를 대상으로 오리엔테이션을 마친 뒤 상대교에 지명 절차를 신청하며, 8월 31일부터 순차적으로 진행할 예정입니다. 이후 상대교가 학생에게 직접 안내 메일을 보냅니다.",
                        source))
                .isFalse();
        /* Too short to tell a copy from a shared phrase, so it is not one. */
        assertThat(AiSupport.looksCopiedFrom("상대교에서 학생에게 직접 메일을 발송합니다.", source)).isFalse();
        assertThat(AiSupport.looksCopiedFrom(null, source)).isFalse();
    }

    @Test
    void tellsAnEntryBodyApartFromTheOpenQuestionsAppendedBelowIt() {
        AiSupport.EntryText split = AiSupport.splitOpenQuestions(
                "체류 연장 접수를 진행합니다.  확인이 필요한 내용 담당자는 누구입니까? 마감일은 언제입니까?");

        assertThat(split.body()).isEqualTo("체류 연장 접수를 진행합니다.");
        assertThat(split.openQuestions()).isEqualTo("담당자는 누구입니까? 마감일은 언제입니까?");
    }

    @Test
    void splitsAtTheAppendedListEvenWhenTheBodyMentionsThePhraseItself() {
        AiSupport.EntryText split = AiSupport.splitOpenQuestions(
                "확인이 필요한 내용은 별도 대장에 정리했습니다. 확인이 필요한 내용 마감일은 언제입니까?");

        assertThat(split.body()).isEqualTo("확인이 필요한 내용은 별도 대장에 정리했습니다.");
        assertThat(split.openQuestions()).isEqualTo("마감일은 언제입니까?");
    }

    @Test
    void treatsAnEntryWithNoQuestionListAsAllBody() {
        AiSupport.EntryText split = AiSupport.splitOpenQuestions(" 접수를\n진행합니다. ");

        assertThat(split.body()).isEqualTo("접수를 진행합니다.");
        assertThat(split.openQuestions()).isEmpty();
        assertThat(AiSupport.splitOpenQuestions(null).body()).isEmpty();
    }

    @Test
    void clipsAndTruncatesTheWayTheOriginalRoutesSliced() {
        assertThat(AiSupport.clip("  abcdef  ", 3)).isEqualTo("abc");
        assertThat(AiSupport.clip(null, 3)).isEmpty();
        assertThat(AiSupport.truncate("  abcdef", 4)).isEqualTo("  ab");
    }
}
