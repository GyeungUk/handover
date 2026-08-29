package com.globalaffairs.handover.ai;

import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.PropertyField;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import org.springframework.stereotype.Component;

/**
 * The shared plumbing every model-backed route uses. Port of {@code app/ai-shared.ts}.
 *
 * <p>Models return plain text only; the HTML the editor renders is built here, fully escaped.
 */
@Component
public class AiSupport {

    private final HandoverSchema schema;

    public AiSupport(HandoverSchema schema) {
        this.schema = schema;
    }

    public static String escapeHtml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Collapses whitespace so a model quote can be matched against the text it was drawn from. */
    public static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    /** The entry body: escaped paragraphs, then the open questions as a list when there are any. */
    public static String detailHtml(List<String> paragraphs, List<String> questions) {
        StringBuilder body = new StringBuilder();
        for (String line : paragraphs) {
            body.append("<p>").append(escapeHtml(line)).append("</p>");
        }
        if (questions.isEmpty()) {
            return body.toString();
        }
        body.append("<p><strong>확인이 필요한 내용</strong></p><ul>");
        for (String line : questions) {
            body.append("<li>").append(escapeHtml(line)).append("</li>");
        }
        return body.append("</ul>").toString();
    }

    /** One key/value the model proposed for an entry's property panel. */
    public record PropertyPair(String key, String value) {}

    /** Drop anything the editor's own property fields would not accept. */
    public Map<String, String> cleanProperties(String category, List<PropertyPair> pairs) {
        return cleanProperties(category, pairs, key -> true);
    }

    public Map<String, String> cleanProperties(String category, List<PropertyPair> pairs, Predicate<String> allowKey) {
        List<PropertyField> fields = schema.propertyFields(category);
        Map<String, String> cleaned = new LinkedHashMap<>();
        if (pairs == null) {
            return cleaned;
        }
        for (PropertyPair pair : pairs) {
            if (pair == null) {
                continue;
            }
            PropertyField field = fields.stream()
                    .filter(item -> item.key().equals(pair.key()))
                    .findFirst()
                    .orElse(null);
            String trimmed = pair.value() == null ? "" : pair.value().trim();
            if (field == null || trimmed.isEmpty() || !allowKey.test(pair.key())) {
                continue;
            }
            if (field.options() != null && !field.options().contains(trimmed)) {
                continue;
            }
            cleaned.put(pair.key(), trimmed);
        }
        return cleaned;
    }

    /**
     * The property spec handed to the model. Without the label and the editor's own example the model
     * fills a "next owner" field with a sentence, so both travel with every key.
     */
    public Map<String, Object> allowedProperties() {
        return allowedProperties(key -> true);
    }

    public Map<String, Object> allowedProperties(Predicate<String> include) {
        Map<String, Object> allowed = new LinkedHashMap<>();
        for (String category : schema.categories()) {
            List<Map<String, Object>> entries = new ArrayList<>();
            for (PropertyField field : schema.propertyFields(category)) {
                if (!include.test(field.key())) {
                    continue;
                }
                Map<String, Object> described = new LinkedHashMap<>();
                described.put("key", field.key());
                described.put("설명", field.label());
                if (field.options() != null) {
                    described.put("선택지", field.options());
                } else {
                    described.put("예시", field.placeholder());
                }
                entries.add(described);
            }
            allowed.put(category, entries);
        }
        return allowed;
    }

    /** Trim, drop blanks and cap, the way every route treated a model's string list. */
    public static List<String> trimmedLines(List<String> lines, int limit) {
        if (lines == null) {
            return List.of();
        }
        return lines.stream()
                .filter(java.util.Objects::nonNull)
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .limit(limit)
                .toList();
    }

    /** Cap a field without trimming, where the original route sliced the raw value. */
    public static String truncate(String value, int max) {
        String safe = value == null ? "" : value;
        return safe.length() <= max ? safe : safe.substring(0, max);
    }

    /** Trim and cap a single field, tolerating a null the model omitted. */
    public static String clip(String value, int max) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
