package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** Port of the {@code Team} type in {@code app/org-data.ts}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Team(
        String id,
        String title,
        /* `short` is a Java keyword, so the exported field is bound by name. */
        @JsonProperty("short") String shortName,
        String english,
        String description,
        String color,
        String soft,
        String mark,
        List<Person> people) {}
