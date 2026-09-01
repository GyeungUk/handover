package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/task-dates} — the confirmed days inside a task's week span. */
@RestController
@RequestMapping("/api/task-dates")
public class TaskDateController {

    private final TaskDateService service;

    public TaskDateController(TaskDateService service) {
        this.service = service;
    }

    public record AddRequest(String personId, String taskTitle, String date, String label) {}

    public record DeleteRequest(Long id) {}

    /** Without a task the whole set comes back, which is what the month calendar marks days from. */
    @GetMapping
    public ResponseEntity<Map<String, List<TaskDateResponse>>> list(
            AuthenticatedUser user,
            @RequestParam(required = false) String personId,
            @RequestParam(required = false) String taskTitle) {
        Access.requireRegistered(user);
        List<TaskDateResponse> dates = personId == null && taskTitle == null
                ? service.dates()
                : service.dates(personId, taskTitle);
        return ResponseEntity.ok(Map.of("dates", dates));
    }

    @PostMapping
    public ResponseEntity<Map<String, TaskDateResponse>> add(
            AuthenticatedUser user, @RequestBody(required = false) AddRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        AddRequest body = request == null ? new AddRequest(null, null, null, null) : request;
        TaskDateResponse saved =
                service.add(body.personId(), body.taskTitle(), body.date(), body.label(), current.displayName());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("date", saved));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Boolean>> delete(
            AuthenticatedUser user, @RequestBody(required = false) DeleteRequest request) {
        Access.requireRegistered(user);
        service.delete(request == null ? null : request.id());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
