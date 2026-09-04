package com.globalaffairs.handover.document;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HandoverDraftCopyRepository extends JpaRepository<HandoverDraftCopy, String> {
    List<HandoverDraftCopy> findByOwnerEmailOrderByUpdatedAtDesc(String ownerEmail);
    Optional<HandoverDraftCopy> findByIdAndOwnerEmail(String id, String ownerEmail);
}
