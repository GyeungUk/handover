package com.globalaffairs.handover.ai;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How to reach the model. The key comes from the environment and is never committed.
 *
 * @param apiKey OpenAI API key; when empty every model-backed endpoint answers 503, as the Worker did
 * @param model model id, unchanged from the Next.js build
 * @param baseUrl chat completions endpoint, overridable so tests and proxies can point elsewhere
 * @param timeout how long to wait for the model before giving up
 */
@ConfigurationProperties(prefix = "handover.openai")
public record OpenAiProperties(String apiKey, String model, String baseUrl, Duration timeout) {

    public OpenAiProperties {
        model = model == null || model.isBlank() ? "gpt-5.4-mini" : model;
        baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://api.openai.com/v1/chat/completions" : baseUrl;
        timeout = timeout == null ? Duration.ofSeconds(120) : timeout;
    }

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
