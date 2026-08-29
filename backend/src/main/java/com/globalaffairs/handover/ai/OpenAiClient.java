package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.globalaffairs.handover.web.ApiException;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * One structured-output call. Every route funnels through here so failures read the same way.
 *
 * <p>Port of {@code askModel} in {@code app/ai-shared.ts}, including its two failure messages and
 * their 502 status.
 */
@Component
public class OpenAiClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiClient.class);

    private static final String UPSTREAM_FAILED = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    private static final String UNREADABLE_RESULT = "결과 형식을 읽지 못했습니다. 다시 시도해 주세요.";

    private final OpenAiProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    /* Two constructors, so the injectable one is named explicitly. */
    @Autowired
    public OpenAiClient(OpenAiProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    /** Visible for tests, which point the client at a local server. */
    OpenAiClient(OpenAiProperties properties, ObjectMapper objectMapper, HttpClient httpClient) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    /**
     * Fails with 503 and the caller's own Korean message when no key is configured, matching each
     * route's "이 기능이 설정되지 않았습니다" branch.
     */
    public void requireConfigured(String notConfiguredMessage) {
        if (!properties.configured()) {
            throw ApiException.unavailable(notConfiguredMessage);
        }
    }

    /**
     * Sends one chat completion constrained by a strict JSON schema and returns the parsed content.
     *
     * @param label short route name used in logs, e.g. {@code draft}
     * @param schemaName the {@code json_schema.name} the route used
     * @param schema the JSON schema the answer must satisfy
     * @param system the system prompt
     * @param user the user message
     */
    public JsonNode ask(String label, String schemaName, JsonNode schema, String system, String user) {
        HttpResponse<String> response;
        try {
            response = httpClient.send(buildRequest(schemaName, schema, system, user), bodyHandler());
        } catch (IOException failure) {
            /* The Worker let a network failure surface as a 500; a failed upstream call is a 502. */
            log.error("{}: openai request failed", label, failure);
            throw ApiException.badGateway(UPSTREAM_FAILED);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            log.error("{}: openai request interrupted", label, interrupted);
            throw ApiException.badGateway(UPSTREAM_FAILED);
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String detail = response.body() == null ? "" : response.body();
            log.error("{}: openai request failed {} {}", label, response.statusCode(),
                    detail.substring(0, Math.min(400, detail.length())));
            throw ApiException.badGateway(UPSTREAM_FAILED);
        }

        try {
            JsonNode completion = objectMapper.readTree(response.body());
            String content = completion.path("choices").path(0).path("message").path("content").asText(null);
            if (content == null) {
                throw new IOException("no message content in completion");
            }
            return objectMapper.readTree(content);
        } catch (IOException unreadable) {
            log.error("{}: could not read model answer", label, unreadable);
            throw ApiException.badGateway(UNREADABLE_RESULT);
        }
    }

    private HttpRequest buildRequest(String schemaName, JsonNode schema, String system, String user) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", properties.model());
        var messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", system);
        messages.addObject().put("role", "user").put("content", user);
        ObjectNode responseFormat = body.putObject("response_format");
        responseFormat.put("type", "json_schema");
        ObjectNode jsonSchema = responseFormat.putObject("json_schema");
        jsonSchema.put("name", schemaName);
        jsonSchema.put("strict", true);
        jsonSchema.set("schema", schema);

        return HttpRequest.newBuilder(URI.create(properties.baseUrl()))
                .timeout(properties.timeout())
                .header("Authorization", "Bearer " + properties.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
    }

    private static HttpResponse.BodyHandler<String> bodyHandler() {
        return HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8);
    }
}
