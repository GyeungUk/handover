package com.globalaffairs.handover.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TaskChecklistServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-30T03:04:05.678Z");

    @Mock
    private TaskChecklistItemRepository repository;

    @Mock
    private CustomTaskRepository customTasks;

    private TaskChecklistService service;

    @BeforeEach
    void setUp() {
        OrgData orgData = new OrgData(new ObjectMapper());
        service = new TaskChecklistService(repository, customTasks, orgData, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void returnsAllThreeItemsWhenNothingHasBeenCheckedYet() {
        when(repository.findByTaskKeyOrderByItemKey("minseo::비자 연장 집중기간")).thenReturn(List.of());

        List<TaskChecklistItemResponse> items = service.items("minseo", "비자 연장 집중기간");

        assertThat(items).extracting(TaskChecklistItemResponse::key)
                .containsExactly("result-report", "schedule-share", "contact-refresh");
        assertThat(items).allSatisfy(item -> {
            assertThat(item.completed()).isFalse();
            assertThat(item.updatedBy()).isNull();
            assertThat(item.updatedAt()).isNull();
        });
    }

    @Test
    void mergesSavedStateIntoTheStableDisplayOrder() {
        when(repository.findByTaskKeyOrderByItemKey("minseo::비자 연장 집중기간"))
                .thenReturn(List.of(new TaskChecklistItem(
                        "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                        "schedule-share", true, "박민서", NOW)));

        List<TaskChecklistItemResponse> items = service.items("minseo", "비자 연장 집중기간");

        assertThat(items).extracting(TaskChecklistItemResponse::completed)
                .containsExactly(false, true, false);
        assertThat(items.get(1).updatedBy()).isEqualTo("박민서");
        assertThat(items.get(1).updatedAt()).isEqualTo("2026-08-30T03:04:05.678Z");
    }

    @Test
    void createsARealSavedItemAndAttributesItToTheCurrentAccount() {
        when(repository.findByTaskKeyAndItemKey(
                "minseo::비자 연장 집중기간", "result-report")).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        TaskChecklistItemResponse saved = service.update(
                "minseo", "비자 연장 집중기간", "result-report", true, "박민서");

        assertThat(saved.completed()).isTrue();
        assertThat(saved.updatedBy()).isEqualTo("박민서");
        ArgumentCaptor<TaskChecklistItem> captured = ArgumentCaptor.forClass(TaskChecklistItem.class);
        verify(repository).save(captured.capture());
        assertThat(captured.getValue().getTaskKey()).isEqualTo("minseo::비자 연장 집중기간");
        assertThat(captured.getValue().getUpdatedAt()).isEqualTo(NOW);
    }

    @Test
    void canReopenAnAlreadyCompletedItem() {
        TaskChecklistItem current = new TaskChecklistItem(
                "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                "contact-refresh", true, "최지우", NOW.minusSeconds(60));
        when(repository.findByTaskKeyAndItemKey(
                "minseo::비자 연장 집중기간", "contact-refresh")).thenReturn(Optional.of(current));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        TaskChecklistItemResponse saved = service.update(
                "minseo", "비자 연장 집중기간", "contact-refresh", false, "박민서");

        assertThat(saved.completed()).isFalse();
        assertThat(current.getUpdatedBy()).isEqualTo("박민서");
        assertThat(current.getUpdatedAt()).isEqualTo(NOW);
    }

    @Test
    void rejectsUnknownTasksAndInventedChecklistKeys() {
        assertThatThrownBy(() -> service.items("minseo", "없는 업무"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
        assertThatThrownBy(() -> service.update(
                        "minseo", "비자 연장 집중기간", "made-up", true, "박민서"))
                .isInstanceOf(ApiException.class)
                .hasMessage("유효한 체크 항목과 상태가 필요합니다.");
    }
}
