package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.core.util.Separators;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import org.springframework.stereotype.Component;

/**
 * Renders the payload handed to the model the way {@code JSON.stringify(value, null, 1)} did.
 *
 * <p>The draft route built its user message that way, so the model sees the same bytes it was tuned
 * against: one-space indentation, {@code "key": value} with no space before the colon, and
 * {@code {}} for an empty object.
 */
@Component
public class JsonStringify {

    private final ObjectWriter oneSpaceIndent;
    private final ObjectWriter compact;

    public JsonStringify(ObjectMapper objectMapper) {
        DefaultIndenter indenter = new DefaultIndenter(" ", "\n");
        DefaultPrettyPrinter printer = new DefaultPrettyPrinter()
                .withObjectIndenter(indenter)
                .withArrayIndenter(indenter);
        printer = printer.withSeparators(Separators.createDefaultInstance()
                .withObjectFieldValueSpacing(Separators.Spacing.AFTER)
                .withObjectEntrySpacing(Separators.Spacing.NONE)
                .withArrayValueSpacing(Separators.Spacing.NONE)
                /* JSON.stringify writes `{}` and `[]`; Jackson would otherwise write `{ }`. */
                .withObjectEmptySeparator("")
                .withArrayEmptySeparator(""));
        this.oneSpaceIndent = objectMapper.writer(printer);
        this.compact = objectMapper.writer();
    }

    /** Equivalent of {@code JSON.stringify(value, null, 1)}. */
    public String pretty(Object value) {
        try {
            return oneSpaceIndent.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new IllegalStateException("could not serialise model payload", failure);
        }
    }

    /** Equivalent of {@code JSON.stringify(value)}. */
    public String compact(Object value) {
        try {
            return compact.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new IllegalStateException("could not serialise model payload", failure);
        }
    }
}
