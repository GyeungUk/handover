package com.globalaffairs.handover.ai.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code POST /api/import} response.
 *
 * @param unmapped content the model could not place in any of the four sections, kept visible
 * @param skipped why proposals were rejected before the cards, so a thin result explains itself
 * @param sections section key to Korean label, sent as the Next.js route did
 */
public record ImportResponse(
        String fileName,
        int charCount,
        List<ImportItem> items,
        List<String> unmapped,
        List<Skipped> skipped,
        Map<String, String> sections) {

    /**
     * One rejection reason and how many proposals it applied to.
     *
     * <p>The checks in the service drop a proposal silently, which is right — an ungrounded item
     * must not reach the editor — but a screen that shows two cards out of twelve without saying
     * why reads as the feature having failed. The counts travel with the answer instead.
     *
     * @param reason a Korean noun phrase naming the rejected proposals, e.g. "원문을 그대로 옮긴 항목"
     */
    public record Skipped(String reason, int count) {}

    /** One entry proposed from an uploaded document. */
    public record ImportItem(
            String id,
            String category,
            String title,
            String detail,
            Map<String, String> properties,
            List<String> questions,
            String sourceQuote,
            String confidence) {}
}
