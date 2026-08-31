package com.globalaffairs.handover.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.account.AccountRepository;
import com.globalaffairs.handover.account.AccountSessionRepository;
import com.globalaffairs.handover.account.PasswordResetMailer;
import com.globalaffairs.handover.account.PasswordResetTokenRepository;
import com.globalaffairs.handover.member.CustomMemberRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The login screen's whole conversation against a real database: creating a password for an employee
 * number, signing in and out, and recovering a forgotten password through the emailed code.
 *
 * <p>The mailer is the one thing stubbed — the code it would have sent is captured instead, which is
 * exactly what the person reading their inbox would have. Skipped when no Docker daemon is
 * available; see the README.
 */
@SpringBootTest(properties = {
        "handover.auth.admin-employee-ids=20180001",
        "handover.auth.member-employee-ids=20190002",
})
@AutoConfigureMockMvc
@Testcontainers
@EnabledIf("dockerAvailable")
class AuthApiIntegrationTest {

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

    private static final String MEMBER_ID = "20190002";
    private static final String STRANGER_ID = "99999999";
    private static final String EMAIL = "kim@example.ac.kr";
    private static final String PASSWORD = "handover-2026";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountRepository accounts;

    @Autowired
    private AccountSessionRepository sessions;

    @Autowired
    private PasswordResetTokenRepository resetTokens;

    @Autowired
    private CustomMemberRepository customMembers;

    @MockitoBean
    private PasswordResetMailer mailer;

    @BeforeEach
    void clean() {
        customMembers.deleteAll();
        resetTokens.deleteAll();
        sessions.deleteAll();
        accounts.deleteAll();
    }

    @Test
    void takesAnUnknownEmployeeNumberThroughCreationAndThenSignsItInAgain() throws Exception {
        mockMvc.perform(lookup(MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("register"));

        Cookie session = register();
        assertThat(accounts.findById(MEMBER_ID)).isPresent();

        mockMvc.perform(get("/api/auth/session").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(MEMBER_ID))
                .andExpect(jsonPath("$.user.email").value(EMAIL))
                .andExpect(jsonPath("$.user.role").value("member"));

        /* The number is known now, so the same first step leads to recovery instead. */
        mockMvc.perform(lookup(MEMBER_ID))
                .andExpect(jsonPath("$.status").value("reset"))
                .andExpect(jsonPath("$.maskedEmail").value("k***@e***.kr"));

        mockMvc.perform(post("/api/auth/logout").cookie(session))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("handover_session", 0));
        mockMvc.perform(get("/api/auth/session").cookie(session))
                .andExpect(jsonPath("$.user").doesNotExist());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\",\"password\":\"%s\"}".formatted(MEMBER_ID, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(MEMBER_ID));
    }

    @Test
    void neverStoresThePasswordItWasGiven() throws Exception {
        register();

        assertThat(accounts.findById(MEMBER_ID))
                .get()
                .extracting(account -> account.getPasswordHash())
                .asString()
                .doesNotContain(PASSWORD)
                .startsWith("pbkdf2-sha256$");
    }

    @Test
    void deletesAnAccountOnlyAfterReauthenticationAndRemovesItsOnboardingMember() throws Exception {
        Cookie session = register();
        mockMvc.perform(post("/api/members/onboarding")
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"teamId\":\"management\",\"role\":\"비자 업무\"}"))
                .andExpect(status().isCreated());
        assertThat(customMembers.findByEmployeeId(MEMBER_ID)).isPresent();

        mockMvc.perform(delete("/api/auth/account")
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("비밀번호가 올바르지 않습니다."));
        assertThat(accounts.findById(MEMBER_ID)).isPresent();

        mockMvc.perform(delete("/api/auth/account")
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"%s\"}".formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("handover_session", 0));

        assertThat(accounts.findById(MEMBER_ID)).isEmpty();
        assertThat(customMembers.findByEmployeeId(MEMBER_ID)).isEmpty();
        assertThat(sessions.findAll()).isEmpty();
        mockMvc.perform(get("/api/auth/session").cookie(session))
                .andExpect(jsonPath("$.user").doesNotExist());
        mockMvc.perform(lookup(MEMBER_ID))
                .andExpect(jsonPath("$.status").value("register"));
    }

    @Test
    void letsAnEmployeeNumberOutsideTheConfiguredListsCreateAndUseAnAccount() throws Exception {
        mockMvc.perform(lookup(STRANGER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("register"));

        Cookie session = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"%s","name":"밖사람","email":"out@example.ac.kr",
                                 "password":"%s"}
                                """.formatted(STRANGER_ID, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(STRANGER_ID))
                .andExpect(jsonPath("$.user.role").value("member"))
                .andReturn()
                .getResponse()
                .getCookie("handover_session");
        assertThat(accounts.findById(STRANGER_ID)).isPresent();

        mockMvc.perform(get("/api/members").cookie(session))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\",\"password\":\"%s\"}".formatted(STRANGER_ID, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("member"));
    }

    @Test
    void refusesAnEmployeeNumberThatIsNotAllDigits() throws Exception {
        mockMvc.perform(lookup("2019-0002"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("직번은 숫자만 입력할 수 있습니다."));
    }

    @Test
    void refusesASecondPasswordForANumberThatAlreadyHasOne() throws Exception {
        register();

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"%s","name":"김지현","email":"other@example.ac.kr",
                                 "password":"%s"}
                                """.formatted(MEMBER_ID, PASSWORD)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("이미 비밀번호가 등록된 직번입니다. 비밀번호 찾기를 이용해 주세요."));
    }

    @Test
    void answersAWrongPasswordTheSameWayAsAnUnknownNumber() throws Exception {
        register();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\",\"password\":\"wrong-password\"}".formatted(MEMBER_ID)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("직번 또는 비밀번호가 올바르지 않습니다."));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"20190009\",\"password\":\"%s\"}".formatted(PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("직번 또는 비밀번호가 올바르지 않습니다."));
    }

    @Test
    void recoversAPasswordWithTheCodeItMailedAndEndsEverySessionThatUsedTheOldOne() throws Exception {
        Cookie oldSession = register();

        mockMvc.perform(post("/api/auth/password/reset-request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\"}".formatted(MEMBER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maskedEmail").value("k***@e***.kr"));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(mailer).send(eq(MEMBER_ID), eq(EMAIL), code.capture());
        assertThat(code.getValue()).matches("\\d{6}");

        mockMvc.perform(post("/api/auth/password/reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"%s","code":"000000","password":"a-new-password"}
                                """.formatted(MEMBER_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("인증번호가 올바르지 않습니다."));

        mockMvc.perform(post("/api/auth/password/reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"%s","code":"%s","password":"a-new-password"}
                                """.formatted(MEMBER_ID, code.getValue())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(MEMBER_ID));

        /* The old password may be in someone else's hands, so its sessions do not survive. */
        mockMvc.perform(get("/api/auth/session").cookie(oldSession))
                .andExpect(jsonPath("$.user").doesNotExist());
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\",\"password\":\"%s\"}".formatted(MEMBER_ID, PASSWORD)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\",\"password\":\"a-new-password\"}".formatted(MEMBER_ID)))
                .andExpect(status().isOk());
    }

    @Test
    void refusesToMailACodeToANumberThatHasNoPasswordYet() throws Exception {
        mockMvc.perform(post("/api/auth/password/reset-request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\"}".formatted(MEMBER_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error")
                        .value("아직 비밀번호가 등록되지 않은 직번입니다. 비밀번호 만들기를 먼저 진행해 주세요."));
    }

    @Test
    void burnsACodeOnceItHasBeenUsed() throws Exception {
        register();
        mockMvc.perform(post("/api/auth/password/reset-request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"%s\"}".formatted(MEMBER_ID)))
                .andExpect(status().isOk());
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(mailer).send(eq(MEMBER_ID), eq(EMAIL), code.capture());

        String body = """
                {"employeeId":"%s","code":"%s","password":"a-new-password"}
                """.formatted(MEMBER_ID, code.getValue());
        mockMvc.perform(post("/api/auth/password/reset")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/auth/password/reset")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("인증번호가 만료되었습니다. 다시 요청해 주세요."));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder lookup(String employeeId) {
        return post("/api/auth/lookup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"employeeId\":\"%s\"}".formatted(employeeId));
    }

    private Cookie register() throws Exception {
        Cookie session = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"%s","name":"김지현","email":"%s","password":"%s"}
                                """.formatted(MEMBER_ID, EMAIL, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getCookie("handover_session");
        assertThat(session).isNotNull();
        return session;
    }
}
