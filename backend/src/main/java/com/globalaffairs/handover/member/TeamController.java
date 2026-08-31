package com.globalaffairs.handover.member;

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

/** Administrator-managed parts, kept separate from the exported seed org chart. */
@RestController
@RequestMapping("/api/teams")
public class TeamController {

    private final MemberService service;

    public TeamController(MemberService service) {
        this.service = service;
    }

    public record CreateTeamRequest(String title, String english, String description) {}

    @GetMapping
    public ResponseEntity<Map<String, List<MemberService.TeamView>>> list(AuthenticatedUser user) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(Map.of("customTeams", service.customTeams()));
    }

    @PostMapping
    public ResponseEntity<Map<String, MemberService.TeamView>> create(
            AuthenticatedUser user, @RequestBody(required = false) CreateTeamRequest request) {
        Access.requireAdmin(user);
        CreateTeamRequest body = request == null ? new CreateTeamRequest(null, null, null) : request;
        return ResponseEntity.status(201).body(Map.of(
                "team", service.createTeam(body.title(), body.english(), body.description())));
    }
}
