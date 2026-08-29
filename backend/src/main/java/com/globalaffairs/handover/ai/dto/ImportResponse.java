package com.globalaffairs.handover.ai.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code POST /api/import} response.
 *
 * @param unmapped content the model could not place in any of the four sections, kept visible
 * @param sections section key to Korean label, sent as the Next.js route did
 */
public record ImportResponse(
        String fileName,
        int charCount,
        List<ImportItem> items,
        List<String> unmapped,
        Map<String, String> sections) {

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
