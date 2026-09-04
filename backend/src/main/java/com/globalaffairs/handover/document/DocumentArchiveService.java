package com.globalaffairs.handover.document;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.web.ApiException;
import com.globalaffairs.handover.web.Timestamps;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The record of the years that have closed.
 *
 * <p>The office runs this workspace one academic year at a time: a document is written, approved,
 * and then rolled over into the next year's draft in the same row. That rollover is what this
 * service exists for — before it, an approved year was the only copy of itself, and starting the
 * next year overwrote it. A verdict of 승인 files the document here first, so the year stays
 * readable for as long as the office keeps records of it.
 *
 * <p>What is filed is the document exactly as {@code /api/handover} answers with it. An archive is
 * read whole and never queried into, so a second pair of entry and bundle tables would buy nothing
 * and would quietly rewrite old years every time the live schema changed.
 */
@Service
public class DocumentArchiveService {

    private final HandoverArchiveRepository archives;
    private final AcademicCalendar calendar;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public DocumentArchiveService(
            HandoverArchiveRepository archives,
            AcademicCalendar calendar,
            ObjectMapper objectMapper,
            Clock clock) {
        this.archives = archives;
        this.calendar = calendar;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /** One line of the year list: enough to choose a year without opening the document. */
    public record ArchiveSummary(
            String ownerEmail,
            String ownerName,
            int academicYear,
            String academicYearLabel,
            String status,
            int entryCount,
            int bundleCount,
            String submittedAt,
            String reviewedAt,
            String reviewedBy,
            String archivedAt) {}

    /** A year's record, opened: the list line and the document itself. */
    public record ArchivedDocument(ArchiveSummary archive, DocumentResponse document) {}

    /**
     * Files an approved document as the record of its academic year.
     *
     * <p>Called from inside the transaction that approved it, so a year is recorded exactly when the
     * verdict lands. Approving the same author twice inside one academic year — a correction round
     * that closes in the same year — replaces the record rather than adding a second one, because
     * what belongs in the archive is the document as it was finally approved.
     */
    @Transactional
    public void archiveApproved(HandoverDocument document, DocumentResponse response) {
        if (!DocumentService.APPROVED.equals(document.getStatus())) {
            return;
        }
        int academicYear = academicYearOf(document.getReviewedAt());
        HandoverArchive archive = archives
                .findByOwnerEmailAndAcademicYear(document.getOwnerEmail(), academicYear)
                .orElseGet(() -> new HandoverArchive(document.getOwnerEmail(), academicYear));
        archive.setOwnerName(document.getOwnerName());
        archive.setStatus(DocumentService.APPROVED);
        archive.setDocument(toJson(response));
        archive.setEntryCount(response.entries().size());
        archive.setBundleCount(response.bundles().size());
        archive.setSubmittedAt(document.getSubmittedAt());
        archive.setReviewedAt(document.getReviewedAt());
        archive.setReviewedBy(document.getReviewedBy());
        archive.setArchivedAt(Instant.now(clock));
        archives.save(archive);
    }

    /**
     * Files an approved document that was never archived, and says whether it had to.
     *
     * <p>Documents approved before this table existed have no record of their year, and the annual
     * rollover is the last moment one can be taken: the row is about to become next year's draft.
     * A year that is already on file is left exactly as it was approved.
     */
    @Transactional
    public void archiveIfAbsent(HandoverDocument document, DocumentResponse response) {
        if (!DocumentService.APPROVED.equals(document.getStatus())
                || archives.findByOwnerEmailAndAcademicYear(
                                document.getOwnerEmail(), academicYearOf(document.getReviewedAt()))
                        .isPresent()) {
            return;
        }
        archiveApproved(document, response);
    }

    /**
     * The years on file for one author, or for everybody.
     *
     * @param ownerEmail whose years to list; {@code null} lists every author's, which only the part
     *     leader is allowed to ask for
     */
    @Transactional(readOnly = true)
    public List<ArchiveSummary> list(String ownerEmail) {
        List<HandoverArchive> rows = ownerEmail == null
                ? archives.findAllByOrderByAcademicYearDescOwnerNameAsc()
                : archives.findByOwnerEmailOrderByAcademicYearDesc(ownerEmail);
        return rows.stream().map(this::summarise).toList();
    }

    /** One author's record for one year, or null when that year was never approved. */
    @Transactional(readOnly = true)
    public ArchivedDocument read(String ownerEmail, int academicYear) {
        Optional<HandoverArchive> row = archives.findByOwnerEmailAndAcademicYear(ownerEmail, academicYear);
        return row.map(archive -> new ArchivedDocument(summarise(archive), fromJson(archive.getDocument())))
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public ArchivedDocument latest(String ownerEmail) {
        return archives.findFirstByOwnerEmailOrderByAcademicYearDesc(ownerEmail)
                .map(archive -> new ArchivedDocument(summarise(archive), fromJson(archive.getDocument())))
                .orElse(null);
    }

    private ArchiveSummary summarise(HandoverArchive archive) {
        return new ArchiveSummary(
                archive.getOwnerEmail(),
                archive.getOwnerName(),
                archive.getAcademicYear(),
                archive.getAcademicYear() + "학년도",
                archive.getStatus(),
                archive.getEntryCount(),
                archive.getBundleCount(),
                iso(archive.getSubmittedAt()),
                iso(archive.getReviewedAt()),
                archive.getReviewedBy(),
                iso(archive.getArchivedAt()));
    }

    /**
     * The academic year a verdict belongs to.
     *
     * <p>Read in the office's own time zone rather than UTC: an approval stamped at 09:00 on 3월 1일
     * in Seoul is 00:00 UTC the same day, but one stamped at 08:00 is still 2월 in UTC and would file
     * the whole year one year early.
     */
    private int academicYearOf(Instant reviewedAt) {
        Instant at = reviewedAt == null ? Instant.now(clock) : reviewedAt;
        return calendar.academicYearOf(LocalDate.ofInstant(at, ZoneId.of("Asia/Seoul")));
    }

    private static String iso(Instant instant) {
        return instant == null ? null : Timestamps.toIsoString(instant);
    }

    private String toJson(DocumentResponse document) {
        try {
            return objectMapper.writeValueAsString(document);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("could not serialise the handover document for the archive", failure);
        }
    }

    private DocumentResponse fromJson(String value) {
        try {
            return objectMapper.readValue(value, DocumentResponse.class);
        } catch (JsonProcessingException unreadable) {
            /* A stored year that cannot be read is a fault worth naming, not an empty document. */
            throw new ApiException(
                    org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                    "보관된 인수인계서를 읽지 못했습니다.");
        }
    }
}
