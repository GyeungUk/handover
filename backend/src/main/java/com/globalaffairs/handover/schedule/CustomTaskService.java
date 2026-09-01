package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates, lists and deletes the workspace's calendar tasks.
 *
 * <p>Deletion has to cover two kinds of task. One authored here is a row, so it goes; one from the
 * shipped seed plan is not, so its key is written to {@code removed_tasks} and every reader skips
 * it from then on. Either way the task's reschedule trail and saved checks go with it — leaving
 * them behind would resurrect the task the moment somebody re-used its name.
 */
@Service
public class CustomTaskService {

    private static final int TITLE_MAX = 80;
    private static final int NOTE_MAX = 500;

    private final CustomTaskRepository repository;
    private final RemovedTaskRepository removedTasks;
    private final TaskRescheduleRepository reschedules;
    private final TaskChecklistItemRepository checklistItems;
    private final CustomMemberRepository customMembers;
    private final OrgData orgData;
    private final Clock clock;

    public CustomTaskService(
            CustomTaskRepository repository,
            RemovedTaskRepository removedTasks,
            TaskRescheduleRepository reschedules,
            TaskChecklistItemRepository checklistItems,
            CustomMemberRepository customMembers,
            OrgData orgData,
            Clock clock) {
        this.repository = repository;
        this.removedTasks = removedTasks;
        this.reschedules = reschedules;
        this.checklistItems = checklistItems;
        this.customMembers = customMembers;
        this.orgData = orgData;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CustomTaskResponse> tasks() {
        return repository.findAllByOrderByPersonIdAscStartAscIdAsc().stream()
                .map(CustomTaskResponse::from)
                .toList();
    }

    /** The seed-plan tasks that have been deleted, as {@code personId::title} keys. */
    @Transactional(readOnly = true)
    public List<String> removedTaskKeys() {
        return removedTasks.findAllByOrderByTaskKeyAsc().stream().map(RemovedTask::getTaskKey).toList();
    }

    @Transactional
    public CustomTaskResponse create(
            String personId, String title, Integer start, Integer duration, String note, String createdBy) {
        String normalizedPersonId = personId == null ? "" : personId.trim();
        String normalizedTitle = title == null ? "" : title.trim();
        String normalizedNote = note == null ? "" : note.trim();

        if (normalizedPersonId.isEmpty()
                || (!orgData.isKnownPerson(normalizedPersonId) && !customMembers.existsById(normalizedPersonId))) {
            throw ApiException.badRequest("담당자를 선택해 주세요.");
        }
        if (normalizedTitle.isEmpty()) {
            throw ApiException.badRequest("일정명을 입력해 주세요.");
        }
        if (normalizedTitle.length() > TITLE_MAX) {
            throw ApiException.badRequest("일정명은 %d자 이내로 입력해 주세요.".formatted(TITLE_MAX));
        }
        if (normalizedNote.length() > NOTE_MAX) {
            throw ApiException.badRequest("업무 설명은 %d자 이내로 입력해 주세요.".formatted(NOTE_MAX));
        }
        if (start == null || duration == null || start < 0 || duration < 1 || start + duration > OrgData.WEEKS_IN_YEAR) {
            throw ApiException.badRequest("일정 기간이 학년도 안에 있어야 합니다.");
        }
        /* A seed title is free again once that seed task has been deleted: the tombstone keeps the
           original hidden, so the new task is the only one under the key. */
        String key = OrgData.taskKey(normalizedPersonId, normalizedTitle);
        boolean seedTitleTaken =
                orgData.findSeedTask(normalizedPersonId, normalizedTitle).isPresent()
                        && !removedTasks.existsById(key);
        if (seedTitleTaken || repository.existsByPersonIdAndTitle(normalizedPersonId, normalizedTitle)) {
            throw ApiException.conflict("같은 담당자에게 동일한 이름의 일정이 이미 있습니다.");
        }

        try {
            CustomTask saved = repository.saveAndFlush(new CustomTask(
                    normalizedPersonId,
                    normalizedTitle,
                    start,
                    duration,
                    normalizedNote,
                    createdBy,
                    Instant.now(clock)));
            return CustomTaskResponse.from(saved);
        } catch (DataIntegrityViolationException raced) {
            throw ApiException.conflict("같은 담당자에게 동일한 이름의 일정이 이미 있습니다.");
        }
    }

    /**
     * Removes one task from the calendar for everyone, along with its reschedule trail and its
     * saved checks. Deleting a task that is already gone is a 404 rather than a silent success, so
     * two people clicking delete on the same task do not both see it work.
     */
    @Transactional
    public void delete(String personId, String title, String removedBy) {
        String normalizedPersonId = personId == null ? "" : personId.trim();
        String normalizedTitle = title == null ? "" : title.trim();
        if (normalizedPersonId.isEmpty() || normalizedTitle.isEmpty()) {
            throw ApiException.badRequest("유효한 업무 정보가 필요합니다.");
        }

        String key = OrgData.taskKey(normalizedPersonId, normalizedTitle);
        Optional<CustomTask> authored = repository.findByPersonIdAndTitle(normalizedPersonId, normalizedTitle);
        if (authored.isPresent()) {
            repository.delete(authored.get());
        } else if (orgData.findSeedTask(normalizedPersonId, normalizedTitle).isPresent()
                && !removedTasks.existsById(key)) {
            removedTasks.save(new RemovedTask(
                    key, normalizedPersonId, normalizedTitle, removedBy, Instant.now(clock)));
        } else {
            throw ApiException.notFound("존재하지 않는 업무입니다.");
        }

        reschedules.deleteByTaskKey(key);
        checklistItems.deleteByTaskKey(key);
    }
}
