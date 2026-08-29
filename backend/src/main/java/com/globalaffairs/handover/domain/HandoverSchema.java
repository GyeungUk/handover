package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The handover document schema shared by the client workspace and the model-backed routes.
 *
 * <p>Port of {@code app/handover-schema.ts}, loaded from {@code domain/handover-schema.json} so the
 * category keys, labels, property fields and finding kinds cannot drift from the frontend's copy.
 */
@Component
public class HandoverSchema {

    private final List<String> categories;
    private final Map<String, String> categoryLabels;
    private final Map<String, List<PropertyField>> propertyFieldsByCategory;
    private final List<String> findingKinds;
    private final Map<String, String> annualActionLabels;

    public HandoverSchema(ObjectMapper objectMapper) {
        try (InputStream stream = new ClassPathResource("domain/handover-schema.json").getInputStream()) {
            Export export = objectMapper.readValue(stream, Export.class);
            this.categories = List.copyOf(export.categories());
            this.categoryLabels = ordered(export.categoryLabels());
            Map<String, List<PropertyField>> fields = new LinkedHashMap<>();
            export.propertyFieldsByCategory().forEach((key, value) -> fields.put(key, List.copyOf(value)));
            this.propertyFieldsByCategory = Collections.unmodifiableMap(fields);
            this.findingKinds = List.copyOf(export.findingKinds());
            this.annualActionLabels = ordered(export.annualActionLabels());
        } catch (IOException failure) {
            throw new IllegalStateException("could not load domain/handover-schema.json", failure);
        }
    }

    /** Keeps the exported key order, which {@code Map.copyOf} would discard. */
    private static Map<String, String> ordered(Map<String, String> source) {
        return Collections.unmodifiableMap(new LinkedHashMap<>(source));
    }

    private record Export(
            List<String> categories,
            Map<String, String> categoryLabels,
            Map<String, List<PropertyField>> propertyFieldsByCategory,
            List<String> findingKinds,
            Map<String, String> annualActionLabels) {}

    /** Section keys in the order the workspace renders them. */
    public List<String> categories() {
        return categories;
    }

    public boolean isCategory(String value) {
        return value != null && categories.contains(value);
    }

    /** Section key to its Korean label, e.g. {@code plan} to 주요업무계획 및 진행사항. */
    public Map<String, String> categoryLabels() {
        return categoryLabels;
    }

    public String categoryLabel(String category) {
        return categoryLabels.get(category);
    }

    public List<PropertyField> propertyFields(String category) {
        return propertyFieldsByCategory.getOrDefault(category, List.of());
    }

    public List<String> findingKinds() {
        return findingKinds;
    }

    public Map<String, String> annualActionLabels() {
        return annualActionLabels;
    }

    /** The renewal actions the model may choose between, in the order the source declares them. */
    public List<String> annualActions() {
        return List.copyOf(annualActionLabels.keySet());
    }

    public boolean isAnnualAction(String value) {
        return value != null && annualActionLabels.containsKey(value);
    }

    /** The section index used to sort proposed entries back into document order. */
    public int categoryOrder(String category) {
        int index = categories.indexOf(category);
        return index < 0 ? categories.size() : index;
    }
}
