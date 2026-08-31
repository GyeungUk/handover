package com.globalaffairs.handover.member;

import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Removing and restoring org-chart members. Port of {@code app/api/members/route.ts}. */
@Service
public class MemberService {

    private final RemovedMemberRepository repository;
    private final CustomMemberRepository customMembers;
    private final CustomTeamRepository customTeams;
    private final OrgData orgData;
    private final Clock clock;

    public MemberService(
            RemovedMemberRepository repository,
            CustomMemberRepository customMembers,
            CustomTeamRepository customTeams,
            OrgData orgData,
            Clock clock) {
        this.repository = repository;
        this.customMembers = customMembers;
        this.customTeams = customTeams;
        this.orgData = orgData;
        this.clock = clock;
    }

    public record MemberView(
            String id, String teamId, String name, String role, String initial, List<Object> tasks) {}

    public record TeamView(
            String id,
            String title,
            String shortName,
            String english,
            String description,
            String color,
            String soft,
            String mark,
            List<Object> people) {
        /** The frontend field is named `short`, while Java reserves that word. */
        @com.fasterxml.jackson.annotation.JsonProperty("short")
        public String shortName() {
            return shortName;
        }
    }

    private record Palette(String color, String soft) {}

    /* Distinct from the four the seed parts hold, so a fifth part does not come
       back in a shade of one of them. */
    private static final List<Palette> PALETTES = List.of(
            new Palette("#a0475c", "#f8eaee"),
            new Palette("#4d7a33", "#edf4e7"),
            new Palette("#7a5230", "#f3ece6"),
            new Palette("#4a5a8c", "#eaedf7"));

    @Transactional(readOnly = true)
    public List<String> removedMemberIds() {
        return repository.findAllByOrderByRemovedAtDesc().stream().map(RemovedMember::getPersonId).toList();
    }

    @Transactional(readOnly = true)
    public List<MemberView> customMembers() {
        return customMembers.findAllByOrderByCreatedAtAsc().stream().map(member -> new MemberView(
                member.getId(), member.getTeamId(), member.getName(), member.getRole(), member.getInitial(), List.of()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TeamView> customTeams() {
        return customTeams.findAllByOrderByCreatedAtAsc().stream().map(team -> new TeamView(
                team.getId(),
                team.getTitle(),
                team.getShortName(),
                team.getEnglish(),
                team.getDescription(),
                team.getColor(),
                team.getSoft(),
                team.getMark(),
                List.of()))
                .toList();
    }

    @Transactional
    public TeamView createTeam(String rawTitle, String rawEnglish, String rawDescription) {
        String title = required(rawTitle, 40, "파트명은 40자 이내로 입력해 주세요.");
        String english = optional(rawEnglish, 80, "영문 파트명은 80자 이내로 입력해 주세요.");
        String description = optional(rawDescription, 160, "파트 설명은 160자 이내로 입력해 주세요.");
        boolean duplicate = orgData.teams().stream().anyMatch(team -> team.title().equalsIgnoreCase(title))
                || customTeams.findAll().stream().anyMatch(team -> team.getTitle().equalsIgnoreCase(title));
        if (duplicate) {
            throw ApiException.badRequest("이미 같은 이름의 파트가 있습니다.");
        }

        long customCount = customTeams.count();
        Palette palette = PALETTES.get((int) (customCount % PALETTES.size()));
        CustomTeam saved = customTeams.save(new CustomTeam(
                "team-" + UUID.randomUUID(),
                title,
                title,
                english,
                description.isEmpty() ? title + " 파트의 주요 업무와 연간 일정을 관리합니다." : description,
                palette.color(),
                palette.soft(),
                "%02d".formatted(orgData.teams().size() + customCount + 1),
                Instant.now(clock)));
        return new TeamView(
                saved.getId(), saved.getTitle(), saved.getShortName(), saved.getEnglish(), saved.getDescription(),
                saved.getColor(), saved.getSoft(), saved.getMark(), List.of());
    }

    @Transactional
    public MemberView createMember(String rawTeamId, String rawName, String rawRole) {
        String teamId = rawTeamId == null ? "" : rawTeamId.trim();
        if (!isKnownTeam(teamId)) {
            throw ApiException.badRequest("담당자가 소속될 파트를 선택해 주세요.");
        }
        String name = required(rawName, 40, "담당자 이름은 40자 이내로 입력해 주세요.");
        String role = required(rawRole, 80, "담당 업무는 80자 이내로 입력해 주세요.");
        String initial = new String(name.codePoints().limit(1).toArray(), 0, 1);
        CustomMember saved = customMembers.save(new CustomMember(
                "person-" + UUID.randomUUID(), teamId, name, role, initial, Instant.now(clock)));
        return new MemberView(
                saved.getId(), saved.getTeamId(), saved.getName(), saved.getRole(), saved.getInitial(), List.of());
    }

    /**
     * Adds the newly registered account to the shared calendar. The account id is stored separately
     * from the public person id, so repeating this step updates the person's part and responsibility
     * instead of creating a second row in the calendar.
     */
    @Transactional
    public MemberView saveOnboarding(AuthenticatedUser user, String rawTeamId, String rawRole) {
        String teamId = rawTeamId == null ? "" : rawTeamId.trim();
        if (!isKnownTeam(teamId)) {
            throw ApiException.badRequest("소속 파트를 선택해 주세요.");
        }
        String role = required(rawRole, 80, "담당 업무는 80자 이내로 입력해 주세요.");
        String name = required(user.displayName(), 40, "계정 이름이 필요합니다.");
        String initial = new String(name.codePoints().limit(1).toArray(), 0, 1);

        CustomMember saved = customMembers.findByEmployeeId(user.employeeId())
                .map(existing -> {
                    existing.updateOnboarding(teamId, name, role, initial);
                    return existing;
                })
                .orElseGet(() -> customMembers.save(new CustomMember(
                        "account-" + user.employeeId(), teamId, name, role, initial, user.employeeId(), Instant.now(clock))));
        return new MemberView(
                saved.getId(), saved.getTeamId(), saved.getName(), saved.getRole(), saved.getInitial(), List.of());
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
        if (personId == null || personId.isBlank()
                || (!orgData.isKnownPerson(personId) && !customMembers.existsById(personId))) {
            throw ApiException.badRequest("유효한 파트원 정보가 필요합니다.");
        }
        return personId;
    }

    private boolean isKnownTeam(String teamId) {
        return orgData.teams().stream().anyMatch(team -> team.id().equals(teamId)) || customTeams.existsById(teamId);
    }

    private static String required(String value, int max, String message) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty() || trimmed.length() > max) {
            throw ApiException.badRequest(message);
        }
        return trimmed;
    }

    private static String optional(String value, int max, String message) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() > max) {
            throw ApiException.badRequest(message);
        }
        return trimmed;
    }
}
