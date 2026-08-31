package com.globalaffairs.handover.schedule;

public record CustomTaskResponse(String personId, String title, int start, int duration, String note) {
    static CustomTaskResponse from(CustomTask task) {
        return new CustomTaskResponse(
                task.getPersonId(), task.getTitle(), task.getStart(), task.getDuration(), task.getNote());
    }
}
