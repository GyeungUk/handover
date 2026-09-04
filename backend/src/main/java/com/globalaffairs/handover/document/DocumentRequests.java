package com.globalaffairs.handover.document;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * The bodies {@code /api/handover} accepts.
 *
 * <p>Every field is nullable on purpose: {@link DocumentService} does the checking, so a missing
 * field produces the same Korean message the Next.js route returned rather than a framework error.
 */
public final class DocumentRequests {

    private DocumentRequests() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AttachmentInput(String id, String name, Long size, String type) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FormattingInput(String fontFamily, String fontSize) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EntryInput(
            String id,
            String category,
            String title,
            String detail,
            Map<String, String> properties,
            List<AttachmentInput> attachments,
            FormattingInput formatting) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BundleInput(String id, String title, List<String> entryIds) {}

    /** {@code PUT /api/handover} — the working document. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SaveRequest(List<EntryInput> entries, List<BundleInput> bundles) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DecisionInput(String bundleId, String decision, String comment) {}

    /** {@code POST /api/handover} — a workflow transition. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ActionRequest(
            String action, String ownerEmail, List<DecisionInput> decisions, List<String> bundleIds) {}
}
