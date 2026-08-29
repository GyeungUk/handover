package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Loads the Korean system prompts and the JSON schemas the routes send to the model.
 *
 * <p>The prompts are not retyped: {@code backend/tools/export-prompts.mjs} copies them out of the
 * Next.js route handlers into {@code ai/prompt/*.txt}, so the wording cannot drift between the two
 * backends. Re-run that script whenever a prompt changes.
 *
 * <p>Neither are the enum values the schemas constrain the model to. A schema writes
 * {@code {"$enumFrom": "categories"}} where it needs the section keys, and this class substitutes the
 * live list from the exported domain data. Adding a section or renaming an action is therefore a
 * change in one place rather than five.
 */
@Component
public class AiResources {

    /** Marker key a schema uses in place of a literal {@code enum} array. */
    private static final String ENUM_FROM = "$enumFrom";

    private final ObjectMapper objectMapper;
    private final Map<String, List<String>> enumSources;
    private final Map<String, String> prompts = new HashMap<>();
    private final Map<String, JsonNode> schemas = new HashMap<>();

    public AiResources(ObjectMapper objectMapper, HandoverSchema schema, AcademicCalendar calendar) {
        this.objectMapper = objectMapper;
        this.enumSources = Map.of(
                "categories", schema.categories(),
                "findingKinds", schema.findingKinds(),
                "annualActions", schema.annualActions(),
                "alignmentActions", calendar.alignmentActions());
    }

    /** The system prompt for a route, e.g. {@code draft}. */
    public synchronized String prompt(String route) {
        return prompts.computeIfAbsent(route, key -> readText("ai/prompt/" + key + ".txt"));
    }

    /** The response JSON schema for a route, e.g. {@code draft}, with its enum markers resolved. */
    public synchronized JsonNode schema(String route) {
        return schemas.computeIfAbsent(route, key -> {
            JsonNode loaded = readJson("ai/schema/" + key + ".json");
            resolveEnums(loaded, "ai/schema/" + key + ".json");
            return loaded;
        });
    }

    /** Walks the tree swapping every {@code $enumFrom} marker for the values it names. */
    private void resolveEnums(JsonNode node, String path) {
        if (node instanceof ObjectNode object) {
            JsonNode marker = object.get(ENUM_FROM);
            if (marker != null) {
                List<String> values = enumSources.get(marker.asText());
                if (values == null) {
                    throw new IllegalStateException(
                            "%s names an unknown enum source: %s".formatted(path, marker.asText()));
                }
                object.remove(ENUM_FROM);
                ArrayNode enumValues = object.putArray("enum");
                values.forEach(enumValues::add);
            }
        }
        node.forEach(child -> resolveEnums(child, path));
    }

    private String readText(String path) {
        try (InputStream stream = new ClassPathResource(path).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException failure) {
            throw new IllegalStateException("could not load " + path, failure);
        }
    }

    private JsonNode readJson(String path) {
        try (InputStream stream = new ClassPathResource(path).getInputStream()) {
            return objectMapper.readTree(stream);
        } catch (IOException failure) {
            throw new IllegalStateException("could not load " + path, failure);
        }
    }
}
