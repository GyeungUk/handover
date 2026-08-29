package com.globalaffairs.handover.member;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.ChatGptUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/members} — reading, removing and restoring org-chart members. */
@RestController
@RequestMapping("/api/members")
public class MemberController {

    private final MemberService service;

    public MemberController(MemberService service) {
        this.service = service;
    }

    /** Body of the remove and restore calls; the frontend sends {@code {"personId": "..."}}. */
    public record MemberRequest(String personId) {}

    @GetMapping
    public ResponseEntity<Map<String, List<String>>> list(ChatGptUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(Map.of("removedMemberIds", service.removedMemberIds()));
    }

    @PostMapping
    public ResponseEntity<Map<String, Boolean>> remove(ChatGptUser user, @RequestBody(required = false) MemberRequest request) {
        Access.requireAdmin(user);
        service.remove(request == null ? null : request.personId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Boolean>> restore(ChatGptUser user, @RequestBody(required = false) MemberRequest request) {
        Access.requireAdmin(user);
        service.restore(request == null ? null : request.personId());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
