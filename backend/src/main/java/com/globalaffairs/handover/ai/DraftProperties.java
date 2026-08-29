package com.globalaffairs.handover.ai;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Policy for the handover draft.
 *
 * @param inferablePropertyKeys the property fields the model may fill in from the plan alone. The
 *     calendar can defend a judgement (how urgent something is, how far along a response is) but
 *     never a fact like a due date, a progress figure, or a partner department, so those stay empty
 *     for the author. Configurable because which fields count as judgement is an editorial call,
 *     not a law of the domain.
 */
@ConfigurationProperties(prefix = "handover.draft")
public record DraftProperties(List<String> inferablePropertyKeys) {

    private static final List<String> DEFAULT_INFERABLE_KEYS =
            List.of("importance", "impact", "response", "priority");

    public DraftProperties {
        inferablePropertyKeys = inferablePropertyKeys == null || inferablePropertyKeys.isEmpty()
                ? DEFAULT_INFERABLE_KEYS
                : inferablePropertyKeys.stream()
                        .filter(key -> key != null && !key.isBlank())
                        .map(String::trim)
                        .distinct()
                        .toList();
    }
}
