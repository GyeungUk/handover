package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/schedules} — the reschedule trail the calendar view replays. */
@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    private final ScheduleService service;

    public ScheduleController(ScheduleService service) {
        this.service = service;
    }

    /** Body the workspace sends when a task is moved. */
    public record RescheduleRequest(String personId, String taskTitle, Integer toStart, String reason) {}

    @GetMapping
    public ResponseEntity<Map<String, List<ScheduleChangeResponse>>> list(AuthenticatedUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(Map.of("changes", service.changes()));
    }

    @PostMapping
    public ResponseEntity<Map<String, ScheduleChangeResponse>> record(
            AuthenticatedUser user, @RequestBody(required = false) RescheduleRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        RescheduleRequest body = request == null ? new RescheduleRequest(null, null, null, null) : request;
        ScheduleChangeResponse change = service.record(
                body.personId(), body.taskTitle(), body.toStart(), body.reason(), current.displayName());
        return ResponseEntity.ok(Map.of("change", change));
    }
}
