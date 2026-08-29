package com.globalaffairs.handover.ai.dto;

import java.util.List;

/** {@code POST /api/quality} response. */
public record QualityResponse(int checked, List<QualityFinding> findings) {

    /** One gap found in an entry. {@code quote} is verified to appear in that entry. */
    public record QualityFinding(
            String id,
            String entryId,
            String kind,
            String severity,
            String quote,
            String message,
            String suggestion) {}
}
