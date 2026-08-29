package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** One editable property on a handover entry. Port of {@code PropertyField} in the TS schema. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PropertyField(String key, String label, String placeholder, List<String> options) {}
