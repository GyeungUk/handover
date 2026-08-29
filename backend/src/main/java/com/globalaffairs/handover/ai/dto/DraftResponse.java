package com.globalaffairs.handover.ai.dto;

import java.util.List;
import java.util.Map;

/** {@code POST /api/draft} response. Field names match the frontend's {@code DraftResponse} type. */
public record DraftResponse(PersonSummary person, String todayLabel, List<DraftItem> drafts) {

    /** One proposed handover entry. {@code detail} is HTML built from escaped model text. */
    public record DraftItem(
            String id,
            String category,
            String title,
            String detail,
            Map<String, String> properties,
            String basis,
            List<String> questions,
            String sourceTask) {}
}
