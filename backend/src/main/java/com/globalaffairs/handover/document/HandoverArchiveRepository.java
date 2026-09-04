package com.globalaffairs.handover.document;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HandoverArchiveRepository extends JpaRepository<HandoverArchive, Long> {

    Optional<HandoverArchive> findByOwnerEmailAndAcademicYear(String ownerEmail, int academicYear);

    /** One author's own years, most recent first. */
    List<HandoverArchive> findByOwnerEmailOrderByAcademicYearDesc(String ownerEmail);

    /** Every author's years for the part leader: newest year first, then by name inside a year. */
    List<HandoverArchive> findAllByOrderByAcademicYearDescOwnerNameAsc();
}
