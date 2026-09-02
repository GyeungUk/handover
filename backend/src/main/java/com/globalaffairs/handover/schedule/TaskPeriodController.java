package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/task-periods} — the tasks whose days are settled, and the days they run on. */
@RestController
@RequestMapping("/api/task-periods")
public class TaskPeriodController {

    private final TaskPeriodService service;

    public TaskPeriodController(TaskPeriodService service) {
        this.service = service;
    }

    public record SetPeriodRequest(String personId, String taskTitle, String startsOn, String endsOn) {}

    public record ClearPeriodRequest(String personId, String taskTitle) {}

    @GetMapping
    public ResponseEntity<Map<String, List<TaskPeriodResponse>>> list(AuthenticatedUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(Map.of("periods", service.periods()));
    }

    /** Idempotent by task: fixing a period and moving one are the same request. */
    @PutMapping
    public ResponseEntity<Map<String, TaskPeriodResponse>> set(
            AuthenticatedUser user, @RequestBody(required = false) SetPeriodRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        SetPeriodRequest body = request == null ? new SetPeriodRequest(null, null, null, null) : request;
        TaskPeriodResponse period = service.set(
                body.personId(), body.taskTitle(), body.startsOn(), body.endsOn(), current.displayName());
        return ResponseEntity.ok(Map.of("period", period));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Boolean>> clear(
            AuthenticatedUser user, @RequestBody(required = false) ClearPeriodRequest request) {
        Access.requireRegistered(user);
        ClearPeriodRequest body = request == null ? new ClearPeriodRequest(null, null) : request;
        service.clear(body.personId(), body.taskTitle());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
