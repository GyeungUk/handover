package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import com.globalaffairs.handover.web.ApiException;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * The upstream contract: what gets sent, and how the two failure modes the Worker distinguished come
 * back to the browser.
 */
class OpenAiClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>();
    private HttpServer server;
    private String chatUrl;

    @Test
    void defaultsToHighestReasoningAcceptedByLunaChatCompletions() {
        OpenAiProperties properties = new OpenAiProperties("key", null, null, null);
        assertThat(properties.reasoningEffort()).isEqualTo("xhigh");
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    private OpenAiClient clientAnswering(int status, String body) {
        return clientAnswering(exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
    }

    private OpenAiClient clientAnswering(HttpHandler handler) {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
        server.createContext("/chat", exchange -> {
            lastRequestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            handler.handle(exchange);
        });
        server.start();

        chatUrl = "http://127.0.0.1:%d/chat".formatted(server.getAddress().getPort());
        OpenAiProperties properties =
                new OpenAiProperties("test-key", chatUrl, "medium", Duration.ofSeconds(5));
        return new OpenAiClient(properties, objectMapper, HttpClient.newHttpClient());
    }

    @BeforeEach
    void resetCapture() {
        lastRequestBody.set(null);
    }

    @Test
    void answersFiveOhThreeWithTheCallersOwnMessageWhenNoKeyIsConfigured() {
        OpenAiProperties unconfigured = new OpenAiProperties("", null, null, null);
        OpenAiClient client = new OpenAiClient(unconfigured, objectMapper);

        assertThatThrownBy(() -> client.requireConfigured("AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요."))
                .isInstanceOf(ApiException.class)
                .hasMessage("AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void sendsTheModelSchemaAndPromptsAsAStrictStructuredOutputRequest() throws Exception {
        OpenAiClient client = clientAnswering(200,
                "{\"choices\":[{\"message\":{\"content\":\"{\\\"drafts\\\":[]}\"}}]}");
        JsonNode schema = objectMapper.readTree("{\"type\":\"object\"}");

        JsonNode answer = client.ask("draft", "handover_draft", schema, "시스템", "사용자");

        assertThat(answer.path("drafts")).isEmpty();
        JsonNode sent = objectMapper.readTree(lastRequestBody.get());
        assertThat(sent.path("model").asText()).isEqualTo("gpt-5.6-luna");
        assertThat(sent.path("messages").get(0).path("role").asText()).isEqualTo("system");
        assertThat(sent.path("messages").get(0).path("content").asText()).isEqualTo("시스템");
        assertThat(sent.path("messages").get(1).path("content").asText()).isEqualTo("사용자");
        assertThat(sent.path("response_format").path("type").asText()).isEqualTo("json_schema");
        assertThat(sent.path("response_format").path("json_schema").path("name").asText()).isEqualTo("handover_draft");
        assertThat(sent.path("response_format").path("json_schema").path("strict").asBoolean()).isTrue();
        assertThat(sent.path("reasoning_effort").asText()).isEqualTo("medium");
    }

    @Test
    void omitsTheReasoningFieldEntirelyWhenItIsConfiguredBlank() throws Exception {
        clientAnswering(200, "{\"choices\":[{\"message\":{\"content\":\"{}\"}}]}");
        OpenAiClient client = new OpenAiClient(
                new OpenAiProperties("test-key", chatUrl, "", Duration.ofSeconds(5)),
                objectMapper,
                HttpClient.newHttpClient());

        client.ask("draft", "handover_draft", objectMapper.readTree("{}"), "시스템", "사용자");

        assertThat(objectMapper.readTree(lastRequestBody.get()).has("reasoning_effort")).isFalse();
    }

    @Test
    void turnsAnUpstreamFailureIntoFiveOhTwoWithTheRetryMessage() throws Exception {
        OpenAiClient client = clientAnswering(500, "{\"error\":\"boom\"}");

        assertThatThrownBy(() -> client.ask("draft", "n", objectMapper.readTree("{}"), "s", "u"))
                .isInstanceOf(ApiException.class)
                .hasMessage("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void turnsAnUnreadableAnswerIntoFiveOhTwoWithTheFormatMessage() throws Exception {
        OpenAiClient client = clientAnswering(200, "{\"choices\":[{\"message\":{\"content\":\"not json\"}}]}");

        assertThatThrownBy(() -> client.ask("draft", "n", objectMapper.readTree("{}"), "s", "u"))
                .isInstanceOf(ApiException.class)
                .hasMessage("결과 형식을 읽지 못했습니다. 다시 시도해 주세요.");
    }

    @Test
    void treatsACompletionWithNoContentAsUnreadableRatherThanCrashing() throws Exception {
        OpenAiClient client = clientAnswering(200, "{\"choices\":[]}");

        assertThatThrownBy(() -> client.ask("draft", "n", objectMapper.readTree("{}"), "s", "u"))
                .isInstanceOf(ApiException.class)
                .hasMessage("결과 형식을 읽지 못했습니다. 다시 시도해 주세요.");
    }
}
