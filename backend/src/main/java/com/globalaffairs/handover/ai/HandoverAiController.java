package com.globalaffairs.handover.ai;

import com.globalaffairs.handover.ai.dto.AlignmentResponse;
import com.globalaffairs.handover.ai.dto.AnnualResponse;
import com.globalaffairs.handover.ai.dto.DraftResponse;
import com.globalaffairs.handover.ai.dto.ImportResponse;
import com.globalaffairs.handover.ai.dto.QualityResponse;
import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.ChatGptUser;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The five model-backed endpoints. Each one checks the caller is registered, then the service checks
 * the feature is configured — the same order the Next.js routes used, so a signed-out caller still
 * sees 401 rather than 503 on a deployment with no OpenAI key.
 */
@RestController
@RequestMapping("/api")
public class HandoverAiController {

    private final DraftService draftService;
    private final ImportService importService;
    private final QualityService qualityService;
    private final AnnualService annualService;
    private final CalendarCheckService calendarCheckService;

    public HandoverAiController(
            DraftService draftService,
            ImportService importService,
            QualityService qualityService,
            AnnualService annualService,
            CalendarCheckService calendarCheckService) {
        this.draftService = draftService;
        this.importService = importService;
        this.qualityService = qualityService;
        this.annualService = annualService;
        this.calendarCheckService = calendarCheckService;
    }

    public record DraftRequest(String personId) {}

    public record ImportRequest(String source, String fileName) {}

    public record QualityRequest(List<QualityService.IncomingEntry> entries) {}

    public record AnnualRequest(List<AnnualService.IncomingEntry> entries, Integer year) {}

    public record CalendarCheckRequest(String personId, Integer year) {}

    @PostMapping("/draft")
    public ResponseEntity<DraftResponse> draft(ChatGptUser user, @RequestBody(required = false) DraftRequest request) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(draftService.draft(request == null ? null : request.personId()));
    }

    @PostMapping("/import")
    public ResponseEntity<ImportResponse> classify(ChatGptUser user, @RequestBody(required = false) ImportRequest request) {
        Access.requireRegistered(user);
        ImportRequest body = request == null ? new ImportRequest(null, null) : request;
        return ResponseEntity.ok(importService.classify(body.source(), body.fileName()));
    }

    @PostMapping("/quality")
    public ResponseEntity<QualityResponse> check(ChatGptUser user, @RequestBody(required = false) QualityRequest request) {
        Access.requireRegistered(user);
        return ResponseEntity.ok(qualityService.check(request == null ? null : request.entries()));
    }

    @PostMapping("/annual")
    public ResponseEntity<AnnualResponse> renew(ChatGptUser user, @RequestBody(required = false) AnnualRequest request) {
        Access.requireRegistered(user);
        AnnualRequest body = request == null ? new AnnualRequest(null, null) : request;
        return ResponseEntity.ok(annualService.renew(body.entries(), body.year()));
    }

    @PostMapping("/calendar-check")
    public ResponseEntity<AlignmentResponse> calendarCheck(
            ChatGptUser user, @RequestBody(required = false) CalendarCheckRequest request) {
        Access.requireRegistered(user);
        CalendarCheckRequest body = request == null ? new CalendarCheckRequest(null, null) : request;
        return ResponseEntity.ok(calendarCheckService.check(body.personId(), body.year()));
    }
}
