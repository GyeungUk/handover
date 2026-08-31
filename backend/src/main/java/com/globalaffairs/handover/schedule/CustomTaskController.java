package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/tasks} — durable calendar tasks authored in the workspace. */
@RestController
@RequestMapping("/api/tasks")
public class CustomTaskController {

    private final CustomTaskService service;

    public CustomTaskController(CustomTaskService service) {
        this.service = service;
    }

    public record CreateTaskRequest(String personId, String title, Integer start, Integer duration, String note) {}

    @GetMapping
    public ResponseEntity<Map<String, List<CustomTaskResponse>>> list(AuthenticatedUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(Map.of("tasks", service.tasks()));
    }

    @PostMapping
    public ResponseEntity<Map<String, CustomTaskResponse>> create(
            AuthenticatedUser user, @RequestBody(required = false) CreateTaskRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        CreateTaskRequest body = request == null ? new CreateTaskRequest(null, null, null, null, null) : request;
        CustomTaskResponse task = service.create(
                body.personId(), body.title(), body.start(), body.duration(), body.note(), current.displayName());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("task", task));
    }
}
