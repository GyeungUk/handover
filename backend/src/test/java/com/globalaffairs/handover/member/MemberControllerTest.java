package com.globalaffairs.handover.member;

import static com.globalaffairs.handover.support.Identity.as;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.support.WebSliceConfig;
import com.globalaffairs.handover.web.ApiException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** {@code /api/members} must answer with the same statuses and Korean messages the Worker did. */
@WebMvcTest(MemberController.class)
@Import(WebSliceConfig.class)
class MemberControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MemberService service;

    @Test
    void listsRemovedMembersForAnyRegisteredAccount() throws Exception {
        when(service.removedMemberIds()).thenReturn(List.of("minseo", "jiwoo"));

        mockMvc.perform(as(get("/api/members"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.removedMemberIds").value(org.hamcrest.Matchers.contains("minseo", "jiwoo")));
    }

    @Test
    void answersFourOhOneWhenNoSessionCookieIsPresent() throws Exception {
        mockMvc.perform(get("/api/members"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
    }

    @Test
    void listsRemovedMembersForAnAccountOutsideTheAdministratorList() throws Exception {
        when(service.removedMemberIds()).thenReturn(List.of());

        mockMvc.perform(as(get("/api/members"), WebSliceConfig.OUTSIDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedMemberIds").isEmpty());
    }

    @Test
    void removesAMemberForAnAdministrator() throws Exception {
        mockMvc.perform(as(post("/api/members"), WebSliceConfig.ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        verify(service).remove("minseo");
    }

    @Test
    void addsAMemberForAnAdministrator() throws Exception {
        when(service.createMember("management", "홍길동", "국제협력"))
                .thenReturn(new MemberService.MemberView(
                        "person-new", "management", "홍길동", "국제협력", "홍", List.of()));

        mockMvc.perform(as(put("/api/members"), WebSliceConfig.ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"teamId":"management","name":"홍길동","role":"국제협력"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.member.id").value("person-new"))
                .andExpect(jsonPath("$.member.teamId").value("management"))
                .andExpect(jsonPath("$.member.tasks").isEmpty());
    }

    @Test
    void restoresAMemberForAnAdministrator() throws Exception {
        mockMvc.perform(as(delete("/api/members"), WebSliceConfig.ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        verify(service).restore("minseo");
    }

    @Test
    void answersFourOhThreeForANonAdministrator() throws Exception {
        mockMvc.perform(as(post("/api/members"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("관리자 권한이 필요합니다."));

        verify(service, never()).remove(any());
    }

    @Test
    void answersFourOhThreeRatherThanFourOhOneForAnUnauthenticatedAdminCall() throws Exception {
        /* The Next.js route checked `role !== 'admin'` first, so a signed-out caller saw 403 here. */
        mockMvc.perform(post("/api/members")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("관리자 권한이 필요합니다."));
    }

    @Test
    void answersFourHundredForAnIdTheOrgChartDoesNotKnow() throws Exception {
        org.mockito.Mockito.doThrow(ApiException.badRequest("유효한 파트원 정보가 필요합니다."))
                .when(service).remove("nobody");

        mockMvc.perform(as(post("/api/members"), WebSliceConfig.ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"nobody\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("유효한 파트원 정보가 필요합니다."));
    }
}
