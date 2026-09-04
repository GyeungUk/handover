package com.globalaffairs.handover.db;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.account.AccountRepository;
import com.globalaffairs.handover.account.AccountSessionRepository;
import com.globalaffairs.handover.document.HandoverArchiveRepository;
import com.globalaffairs.handover.document.HandoverBundleRowRepository;
import com.globalaffairs.handover.document.HandoverDocumentRepository;
import com.globalaffairs.handover.document.HandoverEntryRowRepository;
import com.globalaffairs.handover.member.RemovedMemberRepository;
import com.globalaffairs.handover.schedule.TaskChecklistItemRepository;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import jakarta.servlet.http.Cookie;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The persistent endpoints end to end: a real sign-in, PostgreSQL rows out, and the JSON the
 * existing frontend reads. Skipped when no Docker daemon is available; see the README.
 *
 * <p>Both accounts are created through {@code /api/auth/register}, so every request below carries a
 * session the login endpoints actually issued rather than a hand-made identity.
 */
@SpringBootTest(properties = {
        "handover.auth.admin-employee-ids=20180001",
        "handover.auth.member-employee-ids=20190002",
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

    private static final String ADMIN_ID = "20180001";
    private static final String MEMBER_ID = "20190002";
    private static final String ADMIN = "admin@example.com";
    private static final String MEMBER = "member@example.com";
    private static final String ADMIN_NAME = "박부장";
    private static final String MEMBER_NAME = "김지현";
    private static final String PASSWORD = "handover-2026";

    private Cookie adminSession;
    private Cookie memberSession;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RemovedMemberRepository removedMembers;

    @Autowired
    private TaskRescheduleRepository reschedules;

    @Autowired
    private TaskChecklistItemRepository checklistItems;

    @Autowired
    private HandoverArchiveRepository documentArchives;

    @Autowired
    private HandoverDocumentRepository documents;

    @Autowired
    private HandoverEntryRowRepository documentEntries;

    @Autowired
    private HandoverBundleRowRepository documentBundles;

    @Autowired
    private AccountRepository accounts;

    @Autowired
    private AccountSessionRepository accountSessions;

    @BeforeEach
    void clean() throws Exception {
        removedMembers.deleteAll();
        reschedules.deleteAll();
        checklistItems.deleteAll();
        documentEntries.deleteAll();
        documentBundles.deleteAll();
        documentArchives.deleteAll();
        documents.deleteAll();
        accountSessions.deleteAll();
        accounts.deleteAll();

        adminSession = register(ADMIN_ID, ADMIN_NAME, ADMIN);
        memberSession = register(MEMBER_ID, MEMBER_NAME, MEMBER);
    }

    /** Creates an account the way the login screen does, and keeps the cookie it was handed. */
    private Cookie register(String employeeId, String name, String email) throws Exception {
        Cookie session = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"%s","name":"%s","email":"%s","password":"%s"}
                                """.formatted(employeeId, name, email, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(employeeId))
                .andReturn()
                .getResponse()
                .getCookie("handover_session");
        if (session == null) {
            throw new AssertionError("registering " + employeeId + " set no session cookie");
        }
        return session;
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, Cookie session) {
        return request.cookie(session);
    }

    @Test
    void removesAndRestoresAMemberThroughTheApi() throws Exception {
        mockMvc.perform(as(get("/api/members"), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedMemberIds").isEmpty());

        mockMvc.perform(as(post("/api/members"), adminSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(as(get("/api/members"), memberSession))
                .andExpect(jsonPath("$.removedMemberIds[0]").value("minseo"));

        /* Removing twice must refresh the row rather than fail, as INSERT OR REPLACE did. */
        mockMvc.perform(as(post("/api/members"), adminSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(as(delete("/api/members"), adminSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(as(get("/api/members"), memberSession))
                .andExpect(jsonPath("$.removedMemberIds").isEmpty());
    }

    @Test
    void recordsAScheduleChangeAndReadsItBackInInsertionOrder() throws Exception {
        mockMvc.perform(as(post("/api/schedules"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":23,"reason":"출입국 일정 변경"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.change.fromStart").value(21))
                .andExpect(jsonPath("$.change.toStart").value(23))
                .andExpect(jsonPath("$.change.changedBy").value(MEMBER_NAME))
                .andExpect(jsonPath("$.change.changedAt").value(
                        org.hamcrest.Matchers.matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z")));

        /* The next move starts from the one just recorded, not from the seed plan. */
        mockMvc.perform(as(post("/api/schedules"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":25,"reason":"한 번 더 연기"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.change.fromStart").value(23));

        mockMvc.perform(as(get("/api/schedules"), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changes.length()").value(2))
                .andExpect(jsonPath("$.changes[0].toStart").value(23))
                .andExpect(jsonPath("$.changes[1].toStart").value(25))
                .andExpect(jsonPath("$.changes[0].taskKey").value("minseo::비자 연장 집중기간"));
    }

    @Test
    void savesAndReopensATaskChecklistThroughTheApi() throws Exception {
        mockMvc.perform(as(get("/api/task-checklists")
                        .param("personId", "minseo")
                        .param("taskTitle", "비자 연장 집중기간"), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[0].completed").value(false));

        mockMvc.perform(as(post("/api/task-checklists"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간",
                                 "itemKey":"result-report","completed":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.completed").value(true))
                .andExpect(jsonPath("$.item.updatedBy").value(MEMBER_NAME));

        mockMvc.perform(as(get("/api/task-checklists")
                        .param("personId", "minseo")
                        .param("taskTitle", "비자 연장 집중기간"), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].key").value("result-report"))
                .andExpect(jsonPath("$.items[0].completed").value(true))
                .andExpect(jsonPath("$.items[0].updatedBy").value(MEMBER_NAME));

        mockMvc.perform(as(post("/api/task-checklists"), adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간",
                                 "itemKey":"result-report","completed":false}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.completed").value(false))
                .andExpect(jsonPath("$.item.updatedBy").value(ADMIN_NAME));

        org.assertj.core.api.Assertions.assertThat(checklistItems.count()).isOne();
    }

    @Test
    void refusesAMoveToTheWeekTheTaskAlreadyOccupies() throws Exception {
        mockMvc.perform(as(post("/api/schedules"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","toStart":21,"reason":"같은 주"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("현재와 동일한 일정입니다."));
    }

    @Test
    void carriesAHandoverDocumentFromDraftThroughApprovalAndBack() throws Exception {
        mockMvc.perform(as(get("/api/handover"), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.viewerRole").value("member"));

        mockMvc.perform(as(put("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DOCUMENT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("draft"))
                .andExpect(jsonPath("$.document.ownerName").value(MEMBER_NAME));

        /* A save leaves the ordering, the attachment metadata and the dropped object URL as stored. */
        mockMvc.perform(as(get("/api/handover"), memberSession))
                .andExpect(jsonPath("$.document.entries.length()").value(2))
                .andExpect(jsonPath("$.document.entries[0].id").value("r1"))
                .andExpect(jsonPath("$.document.entries[1].id").value("p1"))
                .andExpect(jsonPath("$.document.entries[0].properties.cycle").value("수시"))
                .andExpect(jsonPath("$.document.entries[0].attachments[0].name").value("명단.xlsx"))
                .andExpect(jsonPath("$.document.entries[0].attachments[0].url").value(""))
                .andExpect(jsonPath("$.document.bundles[0].entryIds").value(
                        org.hamcrest.Matchers.contains("r1", "p1")));

        mockMvc.perform(as(post("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"submit\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("pending"))
                .andExpect(jsonPath("$.document.submittedAt").value(
                        org.hamcrest.Matchers.matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z")));

        mockMvc.perform(as(get("/api/handover"), adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submittedDocuments.length()").value(1))
                .andExpect(jsonPath("$.submittedDocuments[0].ownerEmail").value(MEMBER))
                .andExpect(jsonPath("$.submittedDocuments[0].ownerName").value(MEMBER_NAME))
                .andExpect(jsonPath("$.submittedDocuments[0].status").value("pending"));

        /* An unchanged pending unit may be included in an autosave while other units are drafted. */
        mockMvc.perform(as(put("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content(DOCUMENT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("pending"));

        mockMvc.perform(as(post("/api/handover"), adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"action":"review","ownerEmail":"member@example.com",
                                 "decisions":[{"bundleId":"b1","decision":"rejected","comment":"연락처를 추가해 주세요."}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("rejected"))
                .andExpect(jsonPath("$.document.reviewedBy").value(ADMIN_NAME));

        mockMvc.perform(as(get("/api/handover"), memberSession))
                .andExpect(jsonPath("$.document.status").value("rejected"))
                .andExpect(jsonPath("$.document.bundles[0].comment").value("연락처를 추가해 주세요."));

        /* Rejected means editable again, and resubmitting starts the review over. */
        mockMvc.perform(as(put("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content(DOCUMENT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.bundles[0].decision").value("rejected"))
                .andExpect(jsonPath("$.document.bundles[0].comment").value("연락처를 추가해 주세요."));
        mockMvc.perform(as(post("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"submit\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.bundles[0].decision").value("pending"))
                .andExpect(jsonPath("$.document.bundles[0].comment").value(""));

        mockMvc.perform(as(post("/api/handover"), adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"action":"review","ownerEmail":"member@example.com",
                                 "decisions":[{"bundleId":"b1","decision":"approved","comment":""}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("approved"));

        /* A decided document stays on the part leader's list — that list is the submission record,
         * not only the queue. */
        mockMvc.perform(as(get("/api/handover"), adminSession))
                .andExpect(jsonPath("$.submittedDocuments.length()").value(1))
                .andExpect(jsonPath("$.submittedDocuments[0].status").value("approved"))
                .andExpect(jsonPath("$.submittedDocuments[0].reviewedBy").value(ADMIN_NAME));

        mockMvc.perform(as(put("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content(DOCUMENT))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("승인된 문서는 수정할 수 없습니다."));

        /* The approval closed an academic year, and the record of it is what the annual rollover
         * would otherwise overwrite. The year is read back through its own endpoints below rather
         * than off the row, because that is how the workspace opens a past year. */
        String listed = mockMvc.perform(as(get("/api/handover/archives"), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewerRole").value("member"))
                .andExpect(jsonPath("$.archives.length()").value(1))
                .andExpect(jsonPath("$.archives[0].ownerEmail").value(MEMBER))
                .andExpect(jsonPath("$.archives[0].ownerName").value(MEMBER_NAME))
                .andExpect(jsonPath("$.archives[0].status").value("approved"))
                .andExpect(jsonPath("$.archives[0].entryCount").value(2))
                .andExpect(jsonPath("$.archives[0].bundleCount").value(1))
                .andExpect(jsonPath("$.archives[0].reviewedBy").value(ADMIN_NAME))
                .andReturn().getResponse().getContentAsString();
        int academicYear = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(listed).path("archives").path(0).path("academicYear").asInt();

        mockMvc.perform(as(get("/api/handover/archives/" + academicYear), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.archive.academicYearLabel").value(academicYear + "학년도"))
                /* the document as it was approved, verdicts and all — never the editable copy */
                .andExpect(jsonPath("$.document.status").value("approved"))
                .andExpect(jsonPath("$.document.entries[0].id").value("r1"))
                .andExpect(jsonPath("$.document.entries[0].attachments[0].name").value("명단.xlsx"))
                .andExpect(jsonPath("$.document.bundles[0].decision").value("approved"));

        /* The part leader reads the whole office; an author only ever their own. */
        mockMvc.perform(as(get("/api/handover/archives"), adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewerRole").value("admin"))
                .andExpect(jsonPath("$.archives.length()").value(1))
                .andExpect(jsonPath("$.archives[0].ownerEmail").value(MEMBER));
        mockMvc.perform(as(get("/api/handover/archives/" + academicYear + "?owner=" + MEMBER), adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("approved"));
        mockMvc.perform(as(get("/api/handover/archives?owner=" + ADMIN), memberSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("다른 담당자의 인수인계서는 열 수 없습니다."));
        mockMvc.perform(as(get("/api/handover/archives/" + academicYear + "?owner=" + ADMIN), memberSession))
                .andExpect(status().isForbidden());

        /* A year nobody has closed is missing, not empty. */
        mockMvc.perform(as(get("/api/handover/archives/" + (academicYear - 5)), memberSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("해당 학년도에 보관된 인수인계서가 없습니다."));

        /* Starting next year's draft leaves the closed year exactly as it was approved. */
        mockMvc.perform(as(post("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"rollover\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("draft"));
        mockMvc.perform(as(get("/api/handover/archives/" + academicYear), memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("approved"))
                .andExpect(jsonPath("$.document.bundles[0].decision").value("approved"));
    }

    @Test
    void refusesToSubmitWhileAnEntryIsNotInAnyUnit() throws Exception {
        mockMvc.perform(as(put("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[{"id":"r1","category":"responsibility","title":"체류 관리",
                                             "detail":"<p>본문</p>","properties":{},"attachments":[]}],
                                 "bundles":[]}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(as(post("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"submit\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("제출할 담당업무 단위를 하나 이상 선택해 주세요."));
    }

    @Test
    void letsAPartLeaderOpenASubmittedDocumentButNotAPeer() throws Exception {
        mockMvc.perform(as(put("/api/handover"), memberSession)
                        .contentType(MediaType.APPLICATION_JSON).content(DOCUMENT))
                .andExpect(status().isOk());

        mockMvc.perform(as(get("/api/handover").param("owner", "member@example.com"), adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.entries.length()").value(2));

        mockMvc.perform(as(get("/api/handover").param("owner", "admin@example.com"), memberSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("다른 담당자의 인수인계서는 열 수 없습니다."));
    }

    private static final String DOCUMENT = """
            {"entries":[
               {"id":"r1","category":"responsibility","title":"체류 관리","detail":"<p>본문</p>",
                "properties":{"cycle":"수시","nickname":"버려질 값"},
                "attachments":[{"id":"f1","name":"명단.xlsx","size":2048,"type":"application/vnd.ms-excel",
                                "url":"blob:http://localhost/9f0c"}],
                "formatting":{"fontFamily":"Pretendard","fontSize":"16"}},
               {"id":"p1","category":"plan","title":"연장 접수","detail":"<p>본문</p>",
                "properties":{},"attachments":[],"formatting":{"fontFamily":"Pretendard","fontSize":"16"}}],
             "bundles":[{"id":"b1","title":"체류·비자","entryIds":["r1","p1"]}]}
            """;

    @Test
    void answersFiveOhThreeOnAModelBackedEndpointWhenNoApiKeyIsConfigured() throws Exception {
        /* No OPENAI_API_KEY in the test environment, exactly as on a Worker without the secret. */
        mockMvc.perform(as(post("/api/draft"), memberSession)
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
