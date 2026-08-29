package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * One anchor in the published academic calendar.
 *
 * @param name stable name; the model may only cite anchors by this exact string
 * @param phase which part of the year the anchor belongs to
 * @param week first week slot of the event, 0 = 3월 1주
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AcademicEvent(String name, String phase, int week) {}
