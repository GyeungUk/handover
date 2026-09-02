package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.domain.Task;
import com.globalaffairs.handover.domain.Team;
import com.globalaffairs.handover.member.CustomMember;
import com.globalaffairs.handover.member.CustomTeam;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.member.CustomTeamRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * One person's calendar as the workspace actually shows it.
 *
 * <p>{@link OrgData} on its own is the shipped seed chart — where the workspace starts, not what it
 * holds. People are added here through onboarding, tasks are authored here, and seed tasks are
 * deleted here. Anything that reasons about "this person's work" has to read it through this
 * component: {@link com.globalaffairs.handover.schedule.ScheduleService} and
 * {@link TaskDateService} already resolve a task the same way, and a reader that skips it proposes
 * moves for tasks that were deleted, never sees the ones that were added, and cannot find a person
 * who signed up rather than shipping in the seed data.
 */
@Component
public class WorkspacePlan {

    private final OrgData orgData;
    private final CustomTaskRepository customTasks;
    private final RemovedTaskRepository removedTasks;
    private final CustomMemberRepository customMembers;
    private final CustomTeamRepository customTeams;

    public WorkspacePlan(
            OrgData orgData,
            CustomTaskRepository customTasks,
            RemovedTaskRepository removedTasks,
            CustomMemberRepository customMembers,
            CustomTeamRepository customTeams) {
        this.orgData = orgData;
        this.customTasks = customTasks;
        this.removedTasks = removedTasks;
        this.customMembers = customMembers;
        this.customTeams = customTeams;
    }

    /** Who a person id stands for, whether they ship in the seed chart or signed up here. */
    public record Profile(String id, String name, String role, String teamTitle) {}

    @Transactional(readOnly = true)
    public Optional<Profile> profile(String personId) {
        String id = personId == null ? "" : personId.trim();
        if (id.isEmpty()) {
            return Optional.empty();
        }
        return orgData.findPerson(id)
                .map(found -> new Profile(
                        found.person().id(),
                        found.person().name(),
                        found.person().role(),
                        found.team().title()))
                .or(() -> customMembers.findById(id).map(this::profileOf));
    }

    /**
     * The tasks the person currently has: the seed plan minus whatever was deleted, plus whatever
     * was authored here. Start weeks are the planned ones — reschedules are applied by the caller,
     * which is the only reader that also needs the trail behind them.
     */
    @Transactional(readOnly = true)
    public List<Task> tasks(String personId) {
        String id = personId == null ? "" : personId.trim();
        if (id.isEmpty()) {
            return List.of();
        }
        List<Task> tasks = new ArrayList<>();
        orgData.findPerson(id).ifPresent(found -> found.person().tasks().stream()
                .filter(task -> !removedTasks.existsById(OrgData.taskKey(id, task.title())))
                .forEach(tasks::add));
        customTasks.findByPersonIdOrderByStartAscIdAsc(id).stream().map(CustomTask::asTask).forEach(tasks::add);
        tasks.sort(Comparator.comparingInt(Task::start));
        return List.copyOf(tasks);
    }

    /**
     * One task as the workspace currently holds it, planned start included.
     *
     * <p>A task authored here wins over a seed task of the same name: that name is only free to
     * re-use because the seed one was deleted, and a deleted seed task is not a task any more.
     * Every endpoint that acts on a named task resolves it through here, so none of them can
     * disagree about which task a person-and-title pair means.
     */
    @Transactional(readOnly = true)
    public Optional<Task> findTask(String personId, String title) {
        String id = personId == null ? "" : personId.trim();
        String name = title == null ? "" : title.trim();
        if (id.isEmpty() || name.isEmpty()) {
            return Optional.empty();
        }
        return customTasks.findByPersonIdAndTitle(id, name)
                .map(CustomTask::asTask)
                .or(() -> removedTasks.existsById(OrgData.taskKey(id, name))
                        ? Optional.empty()
                        : orgData.findSeedTask(id, name));
    }

    private Profile profileOf(CustomMember member) {
        return new Profile(member.getId(), member.getName(), member.getRole(), teamTitle(member.getTeamId()));
    }

    private String teamTitle(String teamId) {
        return orgData.teams().stream()
                .filter(team -> team.id().equals(teamId))
                .map(Team::title)
                .findFirst()
                .or(() -> customTeams.findById(teamId).map(CustomTeam::getTitle))
                .orElse("");
    }
}
