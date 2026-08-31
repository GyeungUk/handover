package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.web.Timestamps;

/** The frontend always receives all three keys; untouched items have null audit fields. */
public record TaskChecklistItemResponse(
        String key, boolean completed, String updatedBy, String updatedAt) {

    static TaskChecklistItemResponse empty(String key) {
        return new TaskChecklistItemResponse(key, false, null, null);
    }

    static TaskChecklistItemResponse from(TaskChecklistItem item) {
        return new TaskChecklistItemResponse(
                item.getItemKey(),
                item.isCompleted(),
                item.getUpdatedBy(),
                Timestamps.toIsoString(item.getUpdatedAt()));
    }
}
