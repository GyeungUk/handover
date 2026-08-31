package com.globalaffairs.handover.document;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HandoverEntryRowRepository extends JpaRepository<HandoverEntryRow, Long> {

    /** One document's entries in the order the author arranged them. */
    List<HandoverEntryRow> findByOwnerEmailOrderByPositionAsc(String ownerEmail);

    void deleteByOwnerEmail(String ownerEmail);
}
