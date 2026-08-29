package com.globalaffairs.handover.member;

import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Removing and restoring org-chart members. Port of {@code app/api/members/route.ts}. */
@Service
public class MemberService {

    private final RemovedMemberRepository repository;
    private final OrgData orgData;
    private final Clock clock;

    public MemberService(RemovedMemberRepository repository, OrgData orgData, Clock clock) {
        this.repository = repository;
        this.orgData = orgData;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<String> removedMemberIds() {
        return repository.findAllByOrderByRemovedAtDesc().stream().map(RemovedMember::getPersonId).toList();
    }

    /**
     * Hides a member. The SQLite {@code INSERT OR REPLACE} becomes a read-then-write inside one
     * transaction, which is the same upsert on a single-row primary key: removing an already removed
     * member refreshes the timestamp instead of failing.
     */
    @Transactional
    public void remove(String personId) {
        String validated = validate(personId);
        Instant now = Instant.now(clock);
        repository.findById(validated)
                .ifPresentOrElse(
                        existing -> existing.setRemovedAt(now),
                        () -> repository.save(new RemovedMember(validated, now)));
    }

    @Transactional
    public void restore(String personId) {
        repository.deleteById(validate(personId));
    }

    /**
     * The Next.js route checked against a hardcoded list of the twelve seed ids; the org chart is the
     * same list, so it is the source of truth here.
     */
    private String validate(String personId) {
        if (personId == null || personId.isBlank() || !orgData.isKnownPerson(personId)) {
            throw ApiException.badRequest("유효한 파트원 정보가 필요합니다.");
        }
        return personId;
    }
}
