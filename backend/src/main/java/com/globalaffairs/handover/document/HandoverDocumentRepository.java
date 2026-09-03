package com.globalaffairs.handover.document;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HandoverDocumentRepository extends JpaRepository<HandoverDocument, String> {

    List<HandoverDocument> findByStatusInOrderByUpdatedAtDesc(Collection<String> statuses);
}
