package com.globalaffairs.handover.document;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HandoverBundleRowRepository extends JpaRepository<HandoverBundleRow, Long> {

    /** One document's units in the order the author arranged them. */
    List<HandoverBundleRow> findByOwnerEmailOrderByPositionAsc(String ownerEmail);

    void deleteByOwnerEmail(String ownerEmail);
}
