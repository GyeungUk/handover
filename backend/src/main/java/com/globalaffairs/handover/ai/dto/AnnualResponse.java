package com.globalaffairs.handover.ai.dto;

import java.util.List;
import java.util.Map;

/** {@code POST /api/annual} response. */
public record AnnualResponse(int fromYear, int toYear, int reviewed, List<AnnualItem> items) {

    /**
     * What next year's document should do with one entry.
     *
     * @param entryId the entry this proposal acts on; null for a {@code new} item
     */
    public record AnnualItem(
            String id,
            String action,
            String entryId,
            String previousTitle,
            String category,
            String title,
            String detail,
            Map<String, String> properties,
            String reason,
            List<String> questions) {}
}
