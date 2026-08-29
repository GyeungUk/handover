package com.globalaffairs.handover.member;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

/** Removing and restoring members, including the upsert that replaced SQLite's INSERT OR REPLACE. */
@ExtendWith(MockitoExtension.class)
class MemberServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-29T01:02:03.456Z");

    @Mock
    private RemovedMemberRepository repository;

    private MemberService service;

    @BeforeEach
    void setUp() {
        service = new MemberService(repository, new OrgData(new ObjectMapper()), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void listsRemovedMembersNewestFirst() {
        when(repository.findAllByOrderByRemovedAtDesc()).thenReturn(List.of(
                new RemovedMember("jiwoo", NOW),
                new RemovedMember("minseo", NOW.minusSeconds(60))));

        assertThat(service.removedMemberIds()).containsExactly("jiwoo", "minseo");
    }

    @Test
    void rejectsAnIdThatIsNotInTheOrgChart() {
        assertThatThrownBy(() -> service.remove("nobody"))
                .isInstanceOf(ApiException.class)
                .hasMessage("유효한 파트원 정보가 필요합니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThatThrownBy(() -> service.remove(null)).hasMessage("유효한 파트원 정보가 필요합니다.");
        assertThatThrownBy(() -> service.restore("  ")).hasMessage("유효한 파트원 정보가 필요합니다.");
        verify(repository, never()).save(any());
    }

    @Test
    void insertsARemovalForAMemberThatIsNotYetRemoved() {
        when(repository.findById("minseo")).thenReturn(Optional.empty());

        service.remove("minseo");

        verify(repository).save(any(RemovedMember.class));
    }

    @Test
    void refreshesTheTimestampInsteadOfFailingWhenTheMemberIsAlreadyRemoved() {
        RemovedMember existing = new RemovedMember("minseo", NOW.minusSeconds(600));
        when(repository.findById("minseo")).thenReturn(Optional.of(existing));

        service.remove("minseo");

        assertThat(existing.getRemovedAt()).isEqualTo(NOW);
        verify(repository, never()).save(any());
    }

    @Test
    void restoringDeletesTheRow() {
        service.restore("minseo");
        verify(repository).deleteById("minseo");
    }
}
