package com.globalaffairs.handover.document;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Saves alternate working copies while one of them remains open in the editor. */
@Service
public class DocumentDraftService {
    private final HandoverDocumentRepository documents;
    private final HandoverDraftCopyRepository copies;
    private final DocumentArchiveService archives;
    private final DocumentService service;
    private final ObjectMapper json;
    private final Clock clock;

    public record DraftSummary(String id, int sourceAcademicYear, int entryCount, int bundleCount,
            String createdAt, String updatedAt, boolean active) {}
    public record DraftList(List<DraftSummary> drafts) {}

    public DocumentDraftService(HandoverDocumentRepository documents, HandoverDraftCopyRepository copies,
            DocumentArchiveService archives, DocumentService service, ObjectMapper json, Clock clock) {
        this.documents = documents; this.copies = copies; this.archives = archives;
        this.service = service; this.json = json; this.clock = clock;
    }

    @Transactional
    public DocumentResponse create(String ownerEmail, String ownerName) {
        HandoverDocument live = requiredLive(ownerEmail);
        saveActive(live, ownerEmail);
        DocumentArchiveService.ArchivedDocument source;
        if (DocumentService.APPROVED.equals(live.getStatus())) {
            archives.archiveIfAbsent(live, service.find(ownerEmail));
            source = archives.latest(ownerEmail);
        } else source = archives.latest(ownerEmail);
        if (source == null) throw ApiException.conflict("전년도 승인본이 없습니다.");

        String id = UUID.randomUUID().toString();
        DocumentResponse base = draftOf(source.document());
        copies.save(new HandoverDraftCopy(id, ownerEmail, source.archive().academicYear(), encode(base), Instant.now(clock)));
        live.setActiveDraftId(id);
        return service.replaceWithDraft(ownerEmail, ownerName, requestOf(base));
    }

    @Transactional
    public DocumentResponse open(String ownerEmail, String ownerName, String id) {
        HandoverDocument live = requiredLive(ownerEmail);
        if (id.equals(live.getActiveDraftId())) return service.find(ownerEmail);
        HandoverDraftCopy target = copies.findByIdAndOwnerEmail(id, ownerEmail)
                .orElseThrow(() -> ApiException.notFound("선택한 초안을 찾을 수 없습니다."));
        saveActive(live, ownerEmail);
        live.setActiveDraftId(id);
        target.setUpdatedAt(Instant.now(clock));
        return service.replaceWithDraft(ownerEmail, ownerName, requestOf(decode(target.getDocument())));
    }

    @Transactional(readOnly = true)
    public DraftList list(String ownerEmail) {
        String active = documents.findById(ownerEmail).map(HandoverDocument::getActiveDraftId).orElse(null);
        return new DraftList(copies.findByOwnerEmailOrderByUpdatedAtDesc(ownerEmail).stream().map(copy -> {
            DocumentResponse document = decode(copy.getDocument());
            return new DraftSummary(copy.getId(), copy.getSourceAcademicYear(), document.entries().size(), document.bundles().size(),
                    copy.getCreatedAt().toString(), copy.getUpdatedAt().toString(), copy.getId().equals(active));
        }).toList());
    }

    private HandoverDocument requiredLive(String ownerEmail) {
        return documents.findById(ownerEmail).orElseThrow(() -> ApiException.notFound("저장된 인수인계서가 없습니다."));
    }
    private void saveActive(HandoverDocument live, String ownerEmail) {
        if (live.getActiveDraftId() == null || !DocumentService.DRAFT.equals(live.getStatus())) return;
        copies.findByIdAndOwnerEmail(live.getActiveDraftId(), ownerEmail).ifPresent(copy -> {
            copy.setDocument(encode(service.find(ownerEmail)));
            copy.setUpdatedAt(Instant.now(clock));
        });
    }
    private static DocumentResponse draftOf(DocumentResponse source) {
        return new DocumentResponse(source.ownerName(), DocumentService.DRAFT, source.entries(), source.bundles().stream()
                .map(bundle -> new DocumentResponse.Bundle(bundle.id(), bundle.title(), bundle.entryIds(), null, "", "")).toList(),
                source.updatedAt(), null, null, null);
    }
    private DocumentRequests.SaveRequest requestOf(DocumentResponse document) {
        return new DocumentRequests.SaveRequest(document.entries().stream().map(entry -> new DocumentRequests.EntryInput(
                entry.id(), entry.category(), entry.title(), entry.detail(), entry.properties(), entry.attachments().stream()
                        .map(file -> new DocumentRequests.AttachmentInput(file.id(), file.name(), file.size(), file.type())).toList(),
                new DocumentRequests.FormattingInput(entry.formatting().fontFamily(), entry.formatting().fontSize()))).toList(),
                document.bundles().stream().map(bundle -> new DocumentRequests.BundleInput(bundle.id(), bundle.title(), bundle.entryIds())).toList());
    }
    private String encode(DocumentResponse value) { try { return json.writeValueAsString(value); } catch (JsonProcessingException e) { throw new IllegalStateException(e); } }
    private DocumentResponse decode(String value) { try { return json.readValue(value, DocumentResponse.class); } catch (JsonProcessingException e) { throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "보관된 초안을 읽지 못했습니다."); } }
}
