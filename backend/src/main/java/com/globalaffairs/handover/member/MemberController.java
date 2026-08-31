package com.globalaffairs.handover.member;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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

    public record CreateMemberRequest(String teamId, String name, String role) {}

    /** The self-service profile submitted immediately after a first account registration. */
    public record OnboardingRequest(String teamId, String role) {}

    public record MemberSnapshot(List<String> removedMemberIds, List<MemberService.MemberView> customMembers) {}

    @GetMapping
    public ResponseEntity<MemberSnapshot> list(AuthenticatedUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(new MemberSnapshot(service.removedMemberIds(), service.customMembers()));
    }

    @PutMapping
    public ResponseEntity<Map<String, MemberService.MemberView>> create(
            AuthenticatedUser user, @RequestBody(required = false) CreateMemberRequest request) {
        Access.requireAdmin(user);
        CreateMemberRequest body = request == null ? new CreateMemberRequest(null, null, null) : request;
        return ResponseEntity.status(201).body(Map.of("member", service.createMember(body.teamId(), body.name(), body.role())));
    }

    @PostMapping("/onboarding")
    public ResponseEntity<Map<String, MemberService.MemberView>> onboarding(
            AuthenticatedUser user, @RequestBody(required = false) OnboardingRequest request) {
        AuthenticatedUser account = Access.requireRegistered(user);
        OnboardingRequest body = request == null ? new OnboardingRequest(null, null) : request;
        return ResponseEntity.status(201).body(Map.of("member", service.saveOnboarding(account, body.teamId(), body.role())));
    }

    @PostMapping
    public ResponseEntity<Map<String, Boolean>> remove(AuthenticatedUser user, @RequestBody(required = false) MemberRequest request) {
        Access.requireAdmin(user);
        service.remove(request == null ? null : request.personId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Boolean>> restore(AuthenticatedUser user, @RequestBody(required = false) MemberRequest request) {
        Access.requireAdmin(user);
        service.restore(request == null ? null : request.personId());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
