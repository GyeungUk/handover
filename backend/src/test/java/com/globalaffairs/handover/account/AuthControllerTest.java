package com.globalaffairs.handover.account;

import static com.globalaffairs.handover.support.Identity.as;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.account.AccountService.Lookup;
import com.globalaffairs.handover.account.AccountService.LookupResult;
import com.globalaffairs.handover.account.AccountService.SignedIn;
import com.globalaffairs.handover.auth.AccountIdentity;
import com.globalaffairs.handover.auth.AppRole;
import com.globalaffairs.handover.support.WebSliceConfig;
import com.globalaffairs.handover.web.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** {@code /api/auth} — what the login screen sends, and what it gets back. */
@WebMvcTest(AuthController.class)
@Import(WebSliceConfig.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AccountService accounts;

    private static final String TOKEN = "a-session-token";

    private static SignedIn signedIn() {
        return new SignedIn(
                new AccountIdentity(WebSliceConfig.MEMBER_ID, WebSliceConfig.MEMBER_NAME, WebSliceConfig.MEMBER_EMAIL),
                AppRole.MEMBER,
                TOKEN);
    }

    @Test
    void reportsWhoTheBrowserIsWhenItCarriesASession() throws Exception {
        mockMvc.perform(as(get("/api/auth/session"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(WebSliceConfig.MEMBER_ID))
                .andExpect(jsonPath("$.user.displayName").value(WebSliceConfig.MEMBER_NAME))
                .andExpect(jsonPath("$.user.email").value(WebSliceConfig.MEMBER_EMAIL))
                .andExpect(jsonPath("$.user.role").value("member"));
    }

    /** The frontend renders the login screen from this, so being signed out is a 200, not a 401. */
    @Test
    void answersWithANullUserRatherThanAnErrorWhenThereIsNoSession() throws Exception {
        mockMvc.perform(get("/api/auth/session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user").doesNotExist());
    }

    @Test
    void treatsAnAccountOutsideTheAdministratorListAsAMember() throws Exception {
        mockMvc.perform(as(get("/api/auth/session"), WebSliceConfig.OUTSIDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.employeeId").value(WebSliceConfig.OUTSIDER_ID))
                .andExpect(jsonPath("$.user.role").value("member"));
    }

    @Test
    void sendsAnUnknownEmployeeNumberToPasswordCreation() throws Exception {
        when(accounts.lookup("20190002")).thenReturn(new LookupResult(Lookup.REGISTER, null));

        mockMvc.perform(post("/api/auth/lookup")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"employeeId\":\"20190002\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("register"))
                .andExpect(jsonPath("$.maskedEmail").doesNotExist());
    }

    @Test
    void sendsAKnownEmployeeNumberToRecoveryAndNamesTheInbox() throws Exception {
        when(accounts.lookup("20190002")).thenReturn(new LookupResult(Lookup.RESET, "m***@e***.kr"));

        mockMvc.perform(post("/api/auth/lookup")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"employeeId\":\"20190002\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("reset"))
                .andExpect(jsonPath("$.maskedEmail").value("m***@e***.kr"));
    }

    @Test
    void setsAnHttpOnlySessionCookieOnRegistration() throws Exception {
        when(accounts.register("20190002", "김지현", "kim@example.ac.kr", "handover-2026"))
                .thenReturn(signedIn());

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"20190002","name":"김지현","email":"kim@example.ac.kr",
                                 "password":"handover-2026"}
                                """))
                .andExpect(status().isOk())
                .andExpect(cookie().value("handover_session", TOKEN))
                .andExpect(cookie().httpOnly("handover_session", true))
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("SameSite=Lax")))
                .andExpect(jsonPath("$.user.role").value("member"));
    }

    @Test
    void setsTheSessionCookieOnLogin() throws Exception {
        when(accounts.login("20190002", "handover-2026")).thenReturn(signedIn());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"20190002\",\"password\":\"handover-2026\"}"))
                .andExpect(status().isOk())
                .andExpect(cookie().value("handover_session", TOKEN))
                .andExpect(jsonPath("$.user.employeeId").value(WebSliceConfig.MEMBER_ID));
    }

    @Test
    void surfacesAWrongPasswordAsFourOhOneWithoutSayingWhichHalfWasWrong() throws Exception {
        when(accounts.login(any(), any()))
                .thenThrow(ApiException.unauthorized("직번 또는 비밀번호가 올바르지 않습니다."));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"20190002\",\"password\":\"nope\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("직번 또는 비밀번호가 올바르지 않습니다."));
    }

    @Test
    void dropsTheSessionAndExpiresTheCookieOnLogout() throws Exception {
        mockMvc.perform(as(post("/api/auth/logout"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("handover_session", 0));

        verify(accounts).signOut(WebSliceConfig.sessionTokenFor(WebSliceConfig.MEMBER_ID));
    }

    @Test
    void reportsWhereTheResetCodeWasSent() throws Exception {
        when(accounts.requestPasswordReset("20190002")).thenReturn("m***@e***.kr");

        mockMvc.perform(post("/api/auth/password/reset-request")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"employeeId\":\"20190002\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maskedEmail").value("m***@e***.kr"));
    }

    /** Finishing a reset signs the person in, so they never type the new password twice. */
    @Test
    void signsThePersonInAfterAConfirmedReset() throws Exception {
        when(accounts.confirmPasswordReset("20190002", "123456", "handover-2026")).thenReturn(signedIn());

        mockMvc.perform(post("/api/auth/password/reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeId":"20190002","code":"123456","password":"handover-2026"}
                                """))
                .andExpect(status().isOk())
                .andExpect(cookie().value("handover_session", TOKEN));
    }

    @Test
    void answersFiveOhThreeWhenNoMailServerCanCarryTheCode() throws Exception {
        when(accounts.requestPasswordReset(any()))
                .thenThrow(ApiException.unavailable("비밀번호 재설정 메일을 보낼 수 없습니다. 관리자에게 문의해 주세요."));

        mockMvc.perform(post("/api/auth/password/reset-request")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"employeeId\":\"20190002\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("비밀번호 재설정 메일을 보낼 수 없습니다. 관리자에게 문의해 주세요."));
    }
}
