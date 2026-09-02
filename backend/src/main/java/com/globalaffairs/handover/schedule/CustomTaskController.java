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
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/tasks} — durable calendar tasks authored in the workspace. */
@RestController
@RequestMapping("/api/tasks")
public class CustomTaskController {

    private final CustomTaskService service;

    public CustomTaskController(CustomTaskService service) {
        this.service = service;
    }

    /**
     * A new task. {@code start}/{@code duration} plan it in week slots; {@code startsOn}/{@code
     * endsOn} fix it to real dates instead and the slots are then derived from them.
     */
    public record CreateTaskRequest(
            String personId,
            List<String> personIds,
            String title,
            Integer start,
            Integer duration,
            String note,
            String startsOn,
            String endsOn) {}

    public record DeleteTaskRequest(String personId, String taskTitle) {}

    /**
     * Both halves of what the calendar has to know: the tasks added here, and the keys of the seed
     * tasks that were deleted. The frontend hides the second set before merging in the first.
     */
    public record TaskSnapshot(List<CustomTaskResponse> tasks, List<String> removedTaskKeys) {}

    @GetMapping
    public ResponseEntity<TaskSnapshot> list(AuthenticatedUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(new TaskSnapshot(service.tasks(), service.removedTaskKeys()));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(
            AuthenticatedUser user, @RequestBody(required = false) CreateTaskRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        CreateTaskRequest body =
                request == null ? new CreateTaskRequest(null, null, null, null, null, null, null, null) : request;
        if (body.personIds() != null) {
            List<CustomTaskResponse> tasks = service.createMany(
                    body.personIds(),
                    body.title(),
                    body.start(),
                    body.duration(),
                    body.note(),
                    body.startsOn(),
                    body.endsOn(),
                    current.displayName());
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.<String, Object>of("tasks", tasks));
        }
        CustomTaskResponse task = service.create(
                body.personId(),
                body.title(),
                body.start(),
                body.duration(),
                body.note(),
                body.startsOn(),
                body.endsOn(),
                current.displayName());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.<String, Object>of("task", task));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Boolean>> delete(
            AuthenticatedUser user, @RequestBody(required = false) DeleteTaskRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        DeleteTaskRequest body = request == null ? new DeleteTaskRequest(null, null) : request;
        service.delete(body.personId(), body.taskTitle(), current.displayName());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
