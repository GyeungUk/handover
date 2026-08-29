package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

/** Reads the loose shapes a model answer can take without letting a missing field throw. */
final class ModelJson {

    private ModelJson() {}

    /** Every string in an array node; a non-array or a non-string element yields nothing. */
    static List<String> strings(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                if (item.isTextual()) {
                    values.add(item.asText());
                }
            });
        }
        return values;
    }

    /** The {@code [{key, value}]} property list every prompt asks for. */
    static List<AiSupport.PropertyPair> propertyPairs(JsonNode node) {
        List<AiSupport.PropertyPair> pairs = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> pairs.add(
                    new AiSupport.PropertyPair(item.path("key").asText(null), item.path("value").asText(null))));
        }
        return pairs;
    }
}
