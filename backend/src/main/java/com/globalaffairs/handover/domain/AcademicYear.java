package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Port of the {@code AcademicYear} type in {@code app/academic-calendar.ts}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AcademicYear(int year, String label, List<AcademicEvent> events) {}
