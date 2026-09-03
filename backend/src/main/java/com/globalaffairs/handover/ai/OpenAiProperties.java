package com.globalaffairs.handover.ai;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How to reach the model. The key comes from the environment and is never committed.
 *
 * @param apiKey OpenAI API key; when empty every model-backed endpoint answers 503, as the Worker did
 * @param baseUrl chat completions endpoint, overridable so tests and proxies can point elsewhere
 * @param reasoningEffort how hard a reasoning model thinks before answering; blank omits the field
 * @param timeout how long to wait for the model before giving up
 */
@ConfigurationProperties(prefix = "handover.openai")
public record OpenAiProperties(
        String apiKey, String baseUrl, String reasoningEffort, Duration timeout) {

    public OpenAiProperties {
        baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://api.openai.com/v1/chat/completions" : baseUrl;
        reasoningEffort = reasoningEffort == null ? "medium" : reasoningEffort.trim();
        timeout = timeout == null ? Duration.ofSeconds(120) : timeout;
    }

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Whether to ask the model to reason before answering.
     *
     * <p>Left unset, a GPT-5 class model answers these routes with no reasoning at all, and the
     * section it files a paragraph under becomes close to a guess — 담당업무 collects everything.
     * Blank turns the field off for a model that does not accept it.
     */
    public boolean reasons() {
        return !reasoningEffort.isBlank();
    }
}
