package com.globalaffairs.handover.ai.dto;

import com.globalaffairs.handover.domain.CalendarShift;
import java.util.List;
import java.util.Map;

/** {@code POST /api/calendar-check} response. */
public record AlignmentResponse(
        PersonSummary person,
        int fromYear,
        int toYear,
        List<CalendarShift> shifts,
        List<AlignmentItem> items,
        Map<String, String> actionLabels,
        String notice) {

    /** One task's proposed placement in the target year. Week values are validated server-side. */
    public record AlignmentItem(
            String id,
            String taskTitle,
            String action,
            int currentStart,
            int suggestedStart,
            String currentLabel,
            String suggestedLabel,
            String anchorEvent,
            String anchorLabel,
            int anchorShift,
            String reason,
            String note) {}
}
