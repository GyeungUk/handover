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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/task-checklists} — durable task-level handover preparation. */
@RestController
@RequestMapping("/api/task-checklists")
public class TaskChecklistController {

    private final TaskChecklistService service;

    public TaskChecklistController(TaskChecklistService service) {
        this.service = service;
    }

    public record UpdateRequest(String personId, String taskTitle, String itemKey, Boolean completed) {}

    @GetMapping
    public ResponseEntity<Map<String, List<TaskChecklistItemResponse>>> list(
            AuthenticatedUser user,
            @RequestParam(required = false) String personId,
            @RequestParam(required = false) String taskTitle) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(Map.of("items", service.items(personId, taskTitle)));
    }

    @PostMapping
    public ResponseEntity<Map<String, TaskChecklistItemResponse>> update(
            AuthenticatedUser user, @RequestBody(required = false) UpdateRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        UpdateRequest body = request == null ? new UpdateRequest(null, null, null, null) : request;
        TaskChecklistItemResponse item = service.update(
                body.personId(), body.taskTitle(), body.itemKey(), body.completed(), current.displayName());
        return ResponseEntity.ok(Map.of("item", item));
    }
}
