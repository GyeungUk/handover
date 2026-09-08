package com.globalaffairs.handover.ai.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code POST /api/import} response.
 *
 * @param unmapped content the model could not place in any of the four sections, kept visible
 * @param skipped why proposals were rejected before the cards, so a thin result explains itself
 * @param sections section key to Korean label, sent as the Next.js route did
 * @param workflowGroups the work phases the cards were combined into, in execution order
 * @param verification whether every unit of the uploaded document reached a card
 */
public record ImportResponse(
        String fileName,
        int charCount,
        List<ImportItem> items,
        List<String> unmapped,
        List<Skipped> skipped,
        Map<String, String> sections,
        List<WorkflowGroup> workflowGroups,
        Verification verification) {

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
            String confidence,
            String workflowId,
            Operation operation,
            List<Evidence> evidence) {}

    /**
     * What the successor has to be able to do, kept as fields rather than folded into prose.
     *
     * <p>The complaint this exists for: a document split into one card per heading tells a reader
     * what the previous holder wrote about, not how to run the work. Purpose, timing, the other
     * departments, the systems and forms, the order of the steps, what has to be true first and
     * what the work hands on — and separately the control points — are what make a card operable.
     * Anything the source does not record stays empty here and becomes a question instead.
     */
    public record Operation(
            String purpose,
            Timing timing,
            List<Collaborator> collaborators,
            Resources resources,
            List<String> steps,
            List<String> prerequisites,
            List<String> followUp,
            List<Control> controls) {

        /** True when nothing in the source filled any field, so the card carries no operation. */
        public boolean isEmpty() {
            return purpose.isBlank() && timing.isEmpty() && collaborators.isEmpty()
                    && resources.isEmpty() && steps.isEmpty() && prerequisites.isEmpty()
                    && followUp.isEmpty() && controls.isEmpty();
        }
    }

    /** How often the work comes round, what starts it, and when this card's part is due. */
    public record Timing(String cycle, String trigger, String deadline) {
        public boolean isEmpty() {
            return cycle.isBlank() && trigger.isBlank() && deadline.isBlank();
        }
    }

    /** A department and what it does here — a name on its own does not say who to ask for what. */
    public record Collaborator(String department, String role) {}

    /** The systems worked in, the forms taken as input, and what the work produces. */
    public record Resources(List<String> systems, List<String> documents, List<String> outputs) {
        public boolean isEmpty() {
            return systems.isEmpty() && documents.isEmpty() && outputs.isEmpty();
        }
    }

    /**
     * A control point, kept apart from anything that has actually gone wrong.
     *
     * <p>A source can say "미입력 교원이 확인되면 단과대학에 독려를 요청한다" without any teacher
     * currently being late. Filed as a 현안 that becomes an incident the successor goes looking for;
     * buried in prose it is a rule nobody applies. Splitting it into when, who, what and the point
     * at which it goes to another department keeps it a rule and still keeps it visible.
     *
     * @param escalation who it goes to and on what threshold, or empty when the source sets none
     */
    public record Control(String condition, String owner, String action, String escalation) {}

    /** One quoted fragment of the upload and the unit of the source it came from. */
    public record Evidence(String sourceId, String quote) {}

    /**
     * One phase of the work, holding the cards that belong to it whatever section each is filed in.
     *
     * @param after the phases whose output this phase needs, so the order is a dependency, not a
     *     document order
     */
    public record WorkflowGroup(String id, String title, List<String> itemIds, List<String> after) {}

    /**
     * Whether the upload actually reached the cards, checked here rather than taken on trust.
     *
     * <p>The model is asked to reconcile its own answer against the source, and it will report
     * that it did. That claim is worth nothing on its own: the reconciliation is recomputed from
     * the evidence of the items that survived every acceptance check, so a card dropped for an
     * invented number leaves the paragraph it came from visibly unreflected.
     *
     * @param uncovered units of the source no accepted card is built on, with the model's reason
     * @param warnings structural problems in the answer the author should look at before adopting
     */
    public record Verification(
            int sourceCount, int coveredCount, List<Uncovered> uncovered, List<String> warnings) {}

    /** One unit of the upload that no card was built on, quoted so the author can judge it. */
    public record Uncovered(String sourceId, String excerpt, String reason) {}
}
