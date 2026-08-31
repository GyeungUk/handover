package com.globalaffairs.handover.document;

import java.util.List;
import java.util.Map;

/**
 * A saved document as the workspace reads it. Field names match the JSON the Next.js route
 * produces, which the frontend's {@code HandoverDocument} type is written against.
 */
public record DocumentResponse(
        String ownerName,
        String status,
        List<Entry> entries,
        List<Bundle> bundles,
        String updatedAt,
        String submittedAt,
        String reviewedAt,
        String reviewedBy) {

    /**
     * {@code url} is always empty here. An attachment's object URL belongs to the browser tab that
     * created it, so a stored attachment carries its name and size but nothing to download — the
     * workspace shows it as needing re-attachment rather than as a broken link.
     */
    public record Attachment(String id, String name, long size, String type, String url) {}

    public record Formatting(String fontFamily, String fontSize) {}

    public record Entry(
            String id,
            String category,
            String title,
            String detail,
            Map<String, String> properties,
            List<Attachment> attachments,
            Formatting formatting) {}

    public record Bundle(String id, String title, List<String> entryIds, String decision, String comment) {}
}
