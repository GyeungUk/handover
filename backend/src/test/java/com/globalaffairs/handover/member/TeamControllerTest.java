package com.globalaffairs.handover.member;

import static com.globalaffairs.handover.support.Identity.as;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.support.WebSliceConfig;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TeamController.class)
@Import(WebSliceConfig.class)
class TeamControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MemberService service;

    @Test
    void listsCustomTeamsForARegisteredAccount() throws Exception {
        when(service.customTeams()).thenReturn(List.of(new MemberService.TeamView(
                "team-new", "국제협력", "국제협력", "GLOBAL PARTNERSHIP", "설명",
                "#735b9a", "#efebf6", "05", List.of())));

        mockMvc.perform(as(get("/api/teams"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customTeams[0].title").value("국제협력"))
                .andExpect(jsonPath("$.customTeams[0].short").value("국제협력"))
                .andExpect(jsonPath("$.customTeams[0].people").isEmpty());
    }

    @Test
    void createsATeamForAnAdministratorOnly() throws Exception {
        when(service.createTeam("국제협력", "GLOBAL PARTNERSHIP", "설명"))
                .thenReturn(new MemberService.TeamView(
                        "team-new", "국제협력", "국제협력", "GLOBAL PARTNERSHIP", "설명",
                        "#735b9a", "#efebf6", "05", List.of()));

        mockMvc.perform(as(post("/api/teams"), WebSliceConfig.ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"국제협력","english":"GLOBAL PARTNERSHIP","description":"설명"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.team.id").value("team-new"));

        mockMvc.perform(as(post("/api/teams"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"국제협력\"}"))
                .andExpect(status().isForbidden());
    }
}
