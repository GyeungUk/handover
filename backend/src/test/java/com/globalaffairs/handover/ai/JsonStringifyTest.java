package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The draft prompt was built with {@code JSON.stringify(payload, null, 1)}. These cases pin the
 * exact bytes that produces, so the model keeps seeing the payload shape it was tuned against.
 */
class JsonStringifyTest {

    private final JsonStringify json = new JsonStringify(new ObjectMapper());

    @Test
    void indentsWithOneSpaceAndNoSpaceBeforeTheColon() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("오늘", "8월 2주");
        payload.put("담당자", Map.of("이름", "박민서"));

        assertThat(json.pretty(payload)).isEqualTo("""
                {
                 "오늘": "8월 2주",
                 "담당자": {
                  "이름": "박민서"
                 }
                }""");
    }

    @Test
    void indentsArrayElementsTheSameWay() {
        assertThat(json.pretty(Map.of("업무목록", List.of(1, 2)))).isEqualTo("""
                {
                 "업무목록": [
                  1,
                  2
                 ]
                }""");
    }

    @Test
    void rendersAnEmptyObjectAndAnEmptyArrayWithNothingInside() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("속성", Map.of());
        payload.put("질문", List.of());
        assertThat(json.pretty(payload)).isEqualTo("""
                {
                 "속성": {},
                 "질문": []
                }""");
    }

    @Test
    void writesTheCompactFormTheOtherPromptsInterpolate() {
        assertThat(json.compact(Map.of("key", "value"))).isEqualTo("{\"key\":\"value\"}");
        assertThat(json.compact(Map.of())).isEqualTo("{}");
    }
}
