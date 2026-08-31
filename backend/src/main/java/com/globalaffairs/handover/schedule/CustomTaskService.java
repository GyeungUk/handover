package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates and lists user-authored calendar tasks. */
@Service
public class CustomTaskService {

    private static final int TITLE_MAX = 80;
    private static final int NOTE_MAX = 500;

    private final CustomTaskRepository repository;
    private final CustomMemberRepository customMembers;
    private final OrgData orgData;
    private final Clock clock;

    public CustomTaskService(
            CustomTaskRepository repository,
            CustomMemberRepository customMembers,
            OrgData orgData,
            Clock clock) {
        this.repository = repository;
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
        if (orgData.findSeedTask(normalizedPersonId, normalizedTitle).isPresent()
                || repository.existsByPersonIdAndTitle(normalizedPersonId, normalizedTitle)) {
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
}
