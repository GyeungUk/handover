package com.globalaffairs.handover.db;

import static com.globalaffairs.handover.support.Identity.as;
import static com.globalaffairs.handover.support.Identity.withFullName;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.member.RemovedMemberRepository;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The two persistent endpoints end to end: identity headers in, PostgreSQL rows out, and the JSON
 * the existing frontend reads. Skipped when no Docker daemon is available; see the README.
 */
@SpringBootTest(properties = {
        "handover.auth.admin-emails=admin@example.com",
        "handover.auth.member-emails=member@example.com",
})
@AutoConfigureMockMvc
@Testcontainers
@EnabledIf("dockerAvailable")
class ApiIntegrationTest {

    @Container
    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("handover")
            .withUsername("handover")
            .withPassword("handover");

    static boolean dockerAvailable() {
        try {
            return org.testcontainers.DockerClientFactory.instance().isDockerAvailable();
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    private static final String ADMIN = "admin@example.com";
    private static final String MEMBER = "member@example.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RemovedMemberRepository removedMembers;

    @Autowired
    private TaskRescheduleRepository reschedules;

    @BeforeEach
    void clean() {
        removedMembers.deleteAll();
        reschedules.deleteAll();
    }

    @Test
    void removesAndRestoresAMemberThroughTheApi() throws Exception {
        mockMvc.perform(as(get("/api/members"), MEMBER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedMemberIds").isEmpty());

        mockMvc.perform(as(post("/api/members"), ADMIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(as(get("/api/members"), MEMBER))
                .andExpect(jsonPath("$.removedMemberIds[0]").value("minseo"));

        /* Removing twice must refresh the row rather than fail, as INSERT OR REPLACE did. */
        mockMvc.perform(as(post("/api/members"), ADMIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(as(delete("/api/members"), ADMIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(as(get("/api/members"), MEMBER))
                .andExpect(jsonPath("$.removedMemberIds").isEmpty());
    }

    @Test
    void recordsAScheduleChangeAndReadsItBackInInsertionOrder() throws Exception {
        mockMvc.perform(withFullName(as(post("/api/schedules"), MEMBER), "박민서")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":23,"reason":"출입국 일정 변경"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.change.fromStart").value(21))
                .andExpect(jsonPath("$.change.toStart").value(23))
                .andExpect(jsonPath("$.change.changedBy").value("박민서"))
                .andExpect(jsonPath("$.change.changedAt").value(
                        org.hamcrest.Matchers.matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z")));

        /* The next move starts from the one just recorded, not from the seed plan. */
        mockMvc.perform(as(post("/api/schedules"), MEMBER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":25,"reason":"한 번 더 연기"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.change.fromStart").value(23));

        mockMvc.perform(as(get("/api/schedules"), MEMBER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changes.length()").value(2))
                .andExpect(jsonPath("$.changes[0].toStart").value(23))
                .andExpect(jsonPath("$.changes[1].toStart").value(25))
                .andExpect(jsonPath("$.changes[0].taskKey").value("minseo::비자 연장 집중기간"));
    }

    @Test
    void refusesAMoveToTheWeekTheTaskAlreadyOccupies() throws Exception {
        mockMvc.perform(as(post("/api/schedules"), MEMBER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":21,"reason":"같은 주"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("현재와 동일한 일정입니다."));
    }

    @Test
    void answersFiveOhThreeOnAModelBackedEndpointWhenNoApiKeyIsConfigured() throws Exception {
        /* No OPENAI_API_KEY in the test environment, exactly as on a Worker without the secret. */
        mockMvc.perform(as(post("/api/draft"), MEMBER)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요."))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void stillChecksTheCallerBeforeTheApiKey() throws Exception {
        mockMvc.perform(post("/api/draft")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
    }
}
