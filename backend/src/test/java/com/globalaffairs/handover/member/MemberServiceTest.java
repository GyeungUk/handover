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

    @Mock
    private CustomMemberRepository customMembers;

    @Mock
    private CustomTeamRepository customTeams;

    private MemberService service;

    @BeforeEach
    void setUp() {
        service = new MemberService(
                repository,
                customMembers,
                customTeams,
                new OrgData(new ObjectMapper()),
                Clock.fixed(NOW, ZoneOffset.UTC));
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

    @Test
    void createsATeamWithAServerOwnedPaletteAndMark() {
        when(customTeams.findAll()).thenReturn(List.of());
        when(customTeams.save(any(CustomTeam.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MemberService.TeamView team = service.createTeam(" 국제협력 ", "GLOBAL PARTNERSHIP", "해외 협정을 관리합니다.");

        assertThat(team.title()).isEqualTo("국제협력");
        assertThat(team.mark()).isEqualTo("05");
        assertThat(team.color()).matches("#[0-9a-f]{6}");
        assertThat(team.people()).isEmpty();
    }

    @Test
    void createsAMemberInsideASeedTeam() {
        when(customMembers.save(any(CustomMember.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MemberService.MemberView member = service.createMember("management", " 홍길동 ", " 국제협력 ");

        assertThat(member.teamId()).isEqualTo("management");
        assertThat(member.name()).isEqualTo("홍길동");
        assertThat(member.initial()).isEqualTo("홍");
        assertThat(member.tasks()).isEmpty();
    }

    @Test
    void refusesToCreateAMemberInAnUnknownTeam() {
        assertThatThrownBy(() -> service.createMember("missing", "홍길동", "국제협력"))
                .hasMessage("담당자가 소속될 파트를 선택해 주세요.");
        verify(customMembers, never()).save(any());
    }
}
