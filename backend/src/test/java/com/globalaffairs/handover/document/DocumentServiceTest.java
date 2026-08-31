package com.globalaffairs.handover.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.document.DocumentRequests.AttachmentInput;
import com.globalaffairs.handover.document.DocumentRequests.BundleInput;
import com.globalaffairs.handover.document.DocumentRequests.DecisionInput;
import com.globalaffairs.handover.document.DocumentRequests.EntryInput;
import com.globalaffairs.handover.document.DocumentRequests.FormattingInput;
import com.globalaffairs.handover.document.DocumentRequests.SaveRequest;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;

/**
 * What may be stored, and what each workflow transition is allowed to do. The Korean messages are
 * asserted verbatim: they are what the workspace shows, and they have to match the Worker's.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DocumentServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-29T01:02:03.456Z");
    private static final String OWNER = "author@example.com";

    @Mock
    private HandoverDocumentRepository documents;

    @Mock
    private HandoverEntryRowRepository entries;

    @Mock
    private HandoverBundleRowRepository bundles;

    private ObjectMapper objectMapper;
    private DocumentService service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        service = new DocumentService(
                documents,
                entries,
                bundles,
                new HandoverSchema(objectMapper),
                objectMapper,
                Clock.fixed(NOW, ZoneOffset.UTC));
        when(documents.findById(OWNER)).thenReturn(Optional.empty());
        when(documents.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(entries.findByOwnerEmailOrderByPositionAsc(anyString())).thenReturn(List.of());
        when(bundles.findByOwnerEmailOrderByPositionAsc(anyString())).thenReturn(List.of());
    }

    private static EntryInput entry(String id, String category, String title) {
        return new EntryInput(id, category, title, "<p>본문</p>", Map.of(), List.of(), null);
    }

    private static SaveRequest saveOf(List<EntryInput> entryInputs, List<BundleInput> bundleInputs) {
        return new SaveRequest(entryInputs, bundleInputs);
    }

    @Test
    void storesEntriesAndUnitsInTheOrderTheyArrived() {
        DocumentResponse saved = service.save(OWNER, "김지현", saveOf(
                List.of(entry("r1", "responsibility", "체류 관리"), entry("p1", "plan", "연장 접수")),
                List.of(new BundleInput("b1", "체류·비자", List.of("p1", "r1")))));

        assertThat(saved.status()).isEqualTo("draft");
        assertThat(saved.ownerName()).isEqualTo("김지현");
        assertThat(saved.updatedAt()).isEqualTo("2026-08-29T01:02:03.456Z");
        assertThat(saved.submittedAt()).isNull();
        assertThat(saved.entries()).extracting(DocumentResponse.Entry::id).containsExactly("r1", "p1");
        assertThat(saved.bundles().getFirst().entryIds()).containsExactly("p1", "r1");
        /* a fresh save carries no verdict: only a review may set one */
        assertThat(saved.bundles().getFirst().decision()).isNull();
    }

    @Test
    void rejectsASectionThatIsNotOneOfTheFour() {
        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(
                        List.of(entry("x1", "misc", "제목")), List.of())))
                .isInstanceOf(ApiException.class)
                .hasMessage("알 수 없는 섹션입니다.");
        verify(entries, never()).saveAll(any());
    }

    @Test
    void rejectsDuplicateEntryIds() {
        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(
                        List.of(entry("r1", "responsibility", "하나"), entry("r1", "responsibility", "둘")),
                        List.of())))
                .hasMessage("항목 id가 중복되었습니다.");
    }

    @Test
    void rejectsAUnitPointingAtAnEntryThatIsNotInTheDocument() {
        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(
                        List.of(entry("r1", "responsibility", "하나")),
                        List.of(new BundleInput("b1", "단위", List.of("ghost"))))))
                .hasMessage("존재하지 않는 항목이 업무 단위에 연결되어 있습니다.");
    }

    @Test
    void rejectsOneEntryPlacedInTwoUnits() {
        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(
                        List.of(entry("r1", "responsibility", "하나")),
                        List.of(
                                new BundleInput("b1", "단위 1", List.of("r1")),
                                new BundleInput("b2", "단위 2", List.of("r1"))))))
                .hasMessage("한 항목을 여러 업무 단위에 배치할 수 없습니다.");
    }

    @Test
    void keepsOnlyThePropertyKeysTheSectionDefines() {
        DocumentResponse saved = service.save(OWNER, "김지현", saveOf(
                List.of(new EntryInput(
                        "r1",
                        "responsibility",
                        "체류 관리",
                        "<p>본문</p>",
                        Map.of("cycle", "수시", "importance", "", "nickname", "버려질 값"),
                        List.of(),
                        new FormattingInput("Batang", "18"))),
                List.of()));

        assertThat(saved.entries().getFirst().properties()).containsExactly(Map.entry("cycle", "수시"));
        assertThat(saved.entries().getFirst().formatting().fontFamily()).isEqualTo("Batang");
    }

    @Test
    void fallsBackToTheDefaultFormattingWhenNoneWasSent() {
        DocumentResponse saved = service.save(OWNER, "김지현", saveOf(
                List.of(entry("r1", "responsibility", "체류 관리")), List.of()));

        assertThat(saved.entries().getFirst().formatting())
                .isEqualTo(new DocumentResponse.Formatting("Pretendard", "16"));
    }

    @Test
    void storesAnAttachmentWithoutTheObjectUrlThatOnlyTheBrowserTabHas() {
        service.save(OWNER, "김지현", saveOf(
                List.of(new EntryInput(
                        "r1", "responsibility", "체류 관리", "<p>본문</p>", Map.of(),
                        List.of(new AttachmentInput("f1", "명단.xlsx", 2048L, "application/vnd.ms-excel")),
                        null)),
                List.of()));

        ArgumentCaptor<List<HandoverEntryRow>> captor = ArgumentCaptor.captor();
        verify(entries).saveAll(captor.capture());
        assertThat(captor.getValue().getFirst().getAttachments())
                .isEqualTo("[{\"id\":\"f1\",\"name\":\"명단.xlsx\",\"size\":2048,\"type\":\"application/vnd.ms-excel\"}]");
    }

    @Test
    void rejectsAnAttachmentLargerThanTheSharedLimit() {
        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(
                        List.of(new EntryInput(
                                "r1", "responsibility", "체류 관리", "<p>본문</p>", Map.of(),
                                List.of(new AttachmentInput("f1", "명단.xlsx", 20L * 1024 * 1024 + 1, "")),
                                null)),
                        List.of())))
                .hasMessage("첨부파일은 파일당 20MB까지 저장할 수 있습니다.");
    }

    @Test
    void reportsAStoredAttachmentWithAnEmptyUrlRatherThanANullOne() {
        givenStored("pending", storedEntry("r1", "responsibility", "체류 관리",
                "[{\"id\":\"f1\",\"name\":\"명단.xlsx\",\"size\":2048,\"type\":\"\"}]"), List.of());

        DocumentResponse found = service.find(OWNER);

        assertThat(found.entries().getFirst().attachments().getFirst().url()).isEmpty();
    }

    @Test
    void refusesToSaveOverADocumentThatIsUnderReview() {
        givenStored("pending", null, List.of());

        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(List.of(), List.of())))
                .isInstanceOf(ApiException.class)
                .hasMessage("검토 중인 문서는 수정할 수 없습니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void refusesToSaveOverAnApprovedDocument() {
        givenStored("approved", null, List.of());

        assertThatThrownBy(() -> service.save(OWNER, "김지현", saveOf(List.of(), List.of())))
                .hasMessage("승인된 문서는 수정할 수 없습니다.");
    }

    @Test
    void startsANewEditableCycleFromAnApprovedDocument() {
        givenStored("approved",
                storedEntry("r1", "responsibility", "체류 관리", "[]"),
                List.of(storedBundle("b1", "단위", "[\"r1\"]", "approved", "")));

        DocumentResponse rolled = service.rollover(OWNER);

        assertThat(rolled.status()).isEqualTo("draft");
        assertThat(rolled.entries()).extracting(DocumentResponse.Entry::id).containsExactly("r1");
        assertThat(rolled.bundles().getFirst().decision()).isNull();
        assertThat(rolled.submittedAt()).isNull();
        assertThat(rolled.reviewedAt()).isNull();
        assertThat(rolled.reviewedBy()).isNull();
    }

    @Test
    void refusesAnnualRolloverWhileTheDocumentIsUnderReview() {
        givenStored("pending", null, List.of());

        assertThatThrownBy(() -> service.rollover(OWNER))
                .hasMessage("파트장 검토가 끝난 후 연간 업데이트를 시작할 수 있습니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void letsARejectedDocumentBeEditedAgain() {
        givenStored("rejected", null, List.of(
                storedBundle("b1", "단위", "[]", "rejected", "연락처를 추가해 주세요.")));

        DocumentResponse saved = service.save(OWNER, "김지현", saveOf(
                List.of(), List.of(new BundleInput("b1", "수정한 단위", List.of()))));

        assertThat(saved.status()).isEqualTo("rejected");
        assertThat(saved.bundles().getFirst().title()).isEqualTo("수정한 단위");
        assertThat(saved.bundles().getFirst().decision()).isEqualTo("rejected");
        assertThat(saved.bundles().getFirst().comment()).isEqualTo("연락처를 추가해 주세요.");
    }

    @Test
    void refusesToSubmitWhileAnEntryIsStillUnassigned() {
        givenStored("draft",
                storedEntry("r1", "responsibility", "체류 관리", "[]"),
                List.of(storedBundle("b1", "단위", "[]", null, "")));

        assertThatThrownBy(() -> service.submit(OWNER))
                .hasMessage("항목이 없는 담당업무 단위가 있습니다.");
    }

    @Test
    void refusesToSubmitWithNothingWritten() {
        givenStored("draft", null, List.of());

        assertThatThrownBy(() -> service.submit(OWNER)).hasMessage("작성된 항목이 없습니다.");
    }

    @Test
    void submissionStampsTheTimeAndClearsTheLastRoundsVerdicts() {
        givenStored("rejected",
                storedEntry("r1", "responsibility", "체류 관리", "[]"),
                List.of(storedBundle("b1", "단위", "[\"r1\"]", "rejected", "보완이 필요합니다.")));

        DocumentResponse submitted = service.submit(OWNER);

        assertThat(submitted.status()).isEqualTo("pending");
        assertThat(submitted.submittedAt()).isEqualTo("2026-08-29T01:02:03.456Z");
        assertThat(submitted.reviewedAt()).isNull();
        assertThat(submitted.bundles().getFirst().decision()).isNull();
        assertThat(submitted.bundles().getFirst().comment()).isEmpty();
    }

    @Test
    void refusesToSubmitTwice() {
        givenStored("pending", null, List.of());

        assertThatThrownBy(() -> service.submit(OWNER))
                .hasMessage("이미 제출된 문서입니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void approvesOnlyWhenEveryUnitWasApproved() {
        givenStored("pending",
                storedEntry("r1", "responsibility", "체류 관리", "[]"),
                List.of(
                        storedBundle("b1", "단위 1", "[\"r1\"]", null, ""),
                        storedBundle("b2", "단위 2", "[]", null, "")));

        DocumentResponse reviewed = service.review(OWNER, "파트장", List.of(
                new DecisionInput("b1", "approved", ""),
                new DecisionInput("b2", "approved", "무시되는 코멘트")));

        assertThat(reviewed.status()).isEqualTo("approved");
        assertThat(reviewed.reviewedBy()).isEqualTo("파트장");
        assertThat(reviewed.reviewedAt()).isEqualTo("2026-08-29T01:02:03.456Z");
        /* an approval carries no comment, so an approved unit never shows one */
        assertThat(reviewed.bundles()).allSatisfy(bundle -> assertThat(bundle.comment()).isEmpty());
    }

    @Test
    void oneRejectionSendsTheWholeDocumentBack() {
        givenStored("pending", null, List.of(
                storedBundle("b1", "단위 1", "[]", null, ""),
                storedBundle("b2", "단위 2", "[]", null, "")));

        DocumentResponse reviewed = service.review(OWNER, "파트장", List.of(
                new DecisionInput("b1", "approved", ""),
                new DecisionInput("b2", "rejected", "연락처가 빠졌습니다.")));

        assertThat(reviewed.status()).isEqualTo("rejected");
        assertThat(reviewed.bundles().get(1).comment()).isEqualTo("연락처가 빠졌습니다.");
    }

    @Test
    void requiresACommentOnARejection() {
        givenStored("pending", null, List.of(storedBundle("b1", "단위", "[]", null, "")));

        assertThatThrownBy(() -> service.review(OWNER, "파트장", List.of(
                        new DecisionInput("b1", "rejected", "   "))))
                .hasMessage("반려한 업무 단위에는 보완 요청 코멘트가 필요합니다.");
    }

    @Test
    void requiresAVerdictOnEveryUnit() {
        givenStored("pending", null, List.of(
                storedBundle("b1", "단위 1", "[]", null, ""),
                storedBundle("b2", "단위 2", "[]", null, "")));

        assertThatThrownBy(() -> service.review(OWNER, "파트장", List.of(
                        new DecisionInput("b1", "approved", ""))))
                .hasMessage("모든 담당업무 단위를 검토해야 합니다.");
    }

    @Test
    void rejectsDuplicateOrUnknownUnitVerdicts() {
        givenStored("pending", null, List.of(storedBundle("b1", "단위 1", "[]", null, "")));

        assertThatThrownBy(() -> service.review(OWNER, "파트장", List.of(
                        new DecisionInput("b1", "approved", ""),
                        new DecisionInput("b1", "approved", ""))))
                .hasMessage("같은 업무 단위의 검토 결과가 중복되었습니다.");

        assertThatThrownBy(() -> service.review(OWNER, "파트장", List.of(
                        new DecisionInput("b1", "approved", ""),
                        new DecisionInput("ghost", "approved", ""))))
                .hasMessage("모든 담당업무 단위를 검토해야 합니다.");
    }

    @Test
    void refusesToReviewADocumentThatWasNeverSubmitted() {
        givenStored("draft", null, List.of());

        assertThatThrownBy(() -> service.review(OWNER, "파트장", List.of()))
                .hasMessage("검토 대기 중인 문서가 아닙니다.");
    }

    @Test
    void answersFourOhFourWhenNothingWasEverSaved() {
        assertThatThrownBy(() -> service.submit(OWNER))
                .hasMessage("저장된 인수인계서가 없습니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThatThrownBy(() -> service.review(OWNER, "파트장", List.of()))
                .hasMessage("검토할 인수인계서가 없습니다.");
    }

    /* ---------------------------------------------------------------- */

    private void givenStored(String status, HandoverEntryRow entry, List<HandoverBundleRow> bundleRows) {
        HandoverDocument document = new HandoverDocument(OWNER, "김지현", status, NOW);
        when(documents.findById(OWNER)).thenReturn(Optional.of(document));
        when(entries.findByOwnerEmailOrderByPositionAsc(OWNER))
                .thenReturn(entry == null ? List.of() : List.of(entry));
        when(bundles.findByOwnerEmailOrderByPositionAsc(OWNER)).thenReturn(bundleRows);
    }

    private static HandoverEntryRow storedEntry(
            String entryId, String category, String title, String attachments) {
        return new HandoverEntryRow(
                OWNER, entryId, 0, category, title, "<p>본문</p>", "{}", attachments, "Pretendard", "16");
    }

    private static HandoverBundleRow storedBundle(
            String bundleId, String title, String entryIds, String decision, String comment) {
        return new HandoverBundleRow(OWNER, bundleId, 0, title, entryIds, decision, comment);
    }
}
