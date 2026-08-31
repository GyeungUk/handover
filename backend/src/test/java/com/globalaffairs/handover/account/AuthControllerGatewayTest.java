package com.globalaffairs.handover.account;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.account.AccountService.Lookup;
import com.globalaffairs.handover.account.AccountService.LookupResult;
import com.globalaffairs.handover.auth.AuthProperties;
import com.globalaffairs.handover.auth.AuthzService;
import com.globalaffairs.handover.auth.CurrentUserArgumentResolver;
import com.globalaffairs.handover.auth.GatewayProperties;
import com.globalaffairs.handover.auth.SessionAuthFilter;
import com.globalaffairs.handover.auth.SessionAuthenticator;
import com.globalaffairs.handover.config.CorsProperties;
import com.globalaffairs.handover.config.WebConfig;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * With a gateway secret configured, the account endpoints are only reachable through the proxy.
 * A service exposed by accident must not let a stranger register accounts or grind passwords.
 */
@WebMvcTest(AuthController.class)
@Import(AuthControllerGatewayTest.GatedConfig.class)
class AuthControllerGatewayTest {

    private static final String SECRET = "shared-with-the-proxy";
    private static final String HEADER = "x-handover-gateway-secret";

    @TestConfiguration
    @Import({WebConfig.class, SessionAuthFilter.class, CurrentUserArgumentResolver.class, AuthzService.class})
    static class GatedConfig {

        @Bean
        @Primary
        SessionAuthenticator sessionAuthenticator() {
            return token -> null;
        }

        @Bean
        AuthProperties authProperties() {
            return new AuthProperties(List.of(), List.of("20190002"));
        }

        @Bean
        SessionProperties sessionProperties() {
            return new SessionProperties(Duration.ofDays(14), false, "Lax");
        }

        @Bean
        GatewayProperties gatewayProperties() {
            return new GatewayProperties(SECRET, HEADER);
        }

        @Bean
        CorsProperties corsProperties() {
            return new CorsProperties(List.of(), true);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AccountService accounts;

    @Test
    void refusesAnAccountCallThatDidNotComeThroughTheProxy() throws Exception {
        mockMvc.perform(post("/api/auth/lookup")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"employeeId\":\"20190002\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("허용되지 않은 요청입니다."));
    }

    @Test
    void letsTheSameCallThroughWhenItCarriesTheSecret() throws Exception {
        when(accounts.lookup("20190002")).thenReturn(new LookupResult(Lookup.REGISTER, null));

        mockMvc.perform(post("/api/auth/lookup")
                        .header(HEADER, SECRET)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"employeeId\":\"20190002\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("register"));
    }
}
