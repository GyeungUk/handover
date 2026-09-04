package com.globalaffairs.handover.document;

import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AppRole;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import com.globalaffairs.handover.document.DocumentRequests.ActionRequest;
import com.globalaffairs.handover.document.DocumentRequests.SaveRequest;
import com.globalaffairs.handover.document.DocumentArchiveService.ArchiveSummary;
import com.globalaffairs.handover.document.DocumentArchiveService.ArchivedDocument;
import com.globalaffairs.handover.document.DocumentService.DocumentSummary;
import com.globalaffairs.handover.web.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/handover} — the saved handover document and its review workflow. */
@RestController
@RequestMapping("/api/handover")
public class DocumentController {

    private final DocumentService service;
    private final DocumentArchiveService archives;

    public DocumentController(DocumentService service, DocumentArchiveService archives) {
        this.service = service;
        this.archives = archives;
    }

    /**
     * The envelope both reads and writes answer with. It is a record rather than a {@code Map}
     * because {@code document} is null for an account that has never saved one, and {@code Map.of}
     * cannot hold a null.
     */
    public record DocumentEnvelope(
            DocumentResponse document, String viewerRole, List<DocumentSummary> submittedDocuments) {}

    /**
     * The caller's own document, or another account's when an administrator names one — a part
     * leader has to be able to open what was submitted to them.
     */
    @GetMapping
    public ResponseEntity<DocumentEnvelope> read(
            AuthenticatedUser user, @RequestParam(name = "owner", required = false) String owner) {
        AuthenticatedUser current = Access.requireRegistered(user);
        String requested = owner == null ? "" : owner.trim().toLowerCase();
        if (!requested.isEmpty() && !requested.equals(current.email()) && current.role() != AppRole.ADMIN) {
            throw ApiException.forbidden("다른 담당자의 인수인계서는 열 수 없습니다.");
        }
        String ownerEmail = requested.isEmpty() ? current.email() : requested;
        /* Only the part leader gets the list: it names every author who has submitted. */
        List<DocumentSummary> submitted = current.role() == AppRole.ADMIN ? service.findSubmitted() : List.of();
        return ResponseEntity.ok(new DocumentEnvelope(service.find(ownerEmail), viewerRole(current), submitted));
    }

    /** Saves the working document. Once submitted it is frozen until the reviewer sends it back. */
    @PutMapping
    public ResponseEntity<Map<String, DocumentResponse>> save(
            AuthenticatedUser user, @RequestBody(required = false) SaveRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        DocumentResponse document = service.save(current.email(), current.displayName(), request);
        return ResponseEntity.ok(Map.of("document", document));
    }

    /** Workflow transitions: annual rollover, author submission, and the part leader's verdict. */
    @PostMapping
    public ResponseEntity<Map<String, DocumentResponse>> act(
            AuthenticatedUser user, @RequestBody(required = false) ActionRequest request) {
        AuthenticatedUser current = Access.requireRegistered(user);
        ActionRequest body = request == null ? new ActionRequest(null, null, null) : request;

        DocumentResponse document;
        if ("submit".equals(body.action())) {
            document = service.submit(current.email());
        } else if ("rollover".equals(body.action())) {
            document = service.rollover(current.email());
        } else if ("review".equals(body.action())) {
            if (current.role() != AppRole.ADMIN) {
                throw ApiException.forbidden("파트장 권한이 필요합니다.");
            }
            String owner = body.ownerEmail() == null || body.ownerEmail().isBlank()
                    ? current.email()
                    : body.ownerEmail().trim().toLowerCase();
            document = service.review(owner, current.displayName(), body.decisions());
        } else {
            throw ApiException.badRequest("알 수 없는 요청입니다.");
        }
        return ResponseEntity.ok(Map.of("document", document));
    }

    /**
     * The years on file. An author sees their own; the part leader sees the whole office, or one
     * author's when they name one.
     */
    @GetMapping("/archives")
    public ResponseEntity<ArchiveListEnvelope> archives(
            AuthenticatedUser user, @RequestParam(name = "owner", required = false) String owner) {
        AuthenticatedUser current = Access.requireRegistered(user);
        String requested = normaliseOwner(owner);
        boolean admin = current.role() == AppRole.ADMIN;
        if (!admin && !requested.isEmpty() && !requested.equals(current.email())) {
            throw ApiException.forbidden("다른 담당자의 인수인계서는 열 수 없습니다.");
        }
        /* A part leader who named nobody is asking for the office; anyone else means themselves. */
        String scope = admin ? (requested.isEmpty() ? null : requested) : current.email();
        return ResponseEntity.ok(new ArchiveListEnvelope(archives.list(scope), viewerRole(current)));
    }

    /** One author's record for one academic year, with the document as it was approved. */
    @GetMapping("/archives/{academicYear}")
    public ResponseEntity<ArchivedDocument> archive(
            AuthenticatedUser user,
            @PathVariable int academicYear,
            @RequestParam(name = "owner", required = false) String owner) {
        AuthenticatedUser current = Access.requireRegistered(user);
        String requested = normaliseOwner(owner);
        if (!requested.isEmpty() && !requested.equals(current.email()) && current.role() != AppRole.ADMIN) {
            throw ApiException.forbidden("다른 담당자의 인수인계서는 열 수 없습니다.");
        }
        ArchivedDocument archived =
                archives.read(requested.isEmpty() ? current.email() : requested, academicYear);
        if (archived == null) {
            throw ApiException.notFound("해당 학년도에 보관된 인수인계서가 없습니다.");
        }
        return ResponseEntity.ok(archived);
    }

    /** {@code GET /api/handover/archives} — the year list and who is reading it. */
    public record ArchiveListEnvelope(List<ArchiveSummary> archives, String viewerRole) {}

    private static String normaliseOwner(String owner) {
        return owner == null ? "" : owner.trim().toLowerCase();
    }

    private static String viewerRole(AuthenticatedUser user) {
        return user.role() == AppRole.ADMIN ? "admin" : "member";
    }
}
