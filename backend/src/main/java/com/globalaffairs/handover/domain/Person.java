package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Port of the {@code Person} type in {@code app/org-data.ts}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Person(String id, String name, String role, String initial, List<Task> tasks) {}
