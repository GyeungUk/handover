package com.globalaffairs.handover.schedule;

import static com.globalaffairs.handover.support.Identity.as;
import static org.mockito.ArgumentMatchers.eq;
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

@WebMvcTest(TaskChecklistController.class)
@Import(WebSliceConfig.class)
class TaskChecklistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskChecklistService service;

    @Test
    void returnsTheThreeStatesUnderTheFrontendFieldNames() throws Exception {
        when(service.items("minseo", "비자 연장 집중기간")).thenReturn(List.of(
                new TaskChecklistItemResponse("result-report", true, "박민서", "2026-08-30T03:04:05.678Z"),
                TaskChecklistItemResponse.empty("schedule-share"),
                TaskChecklistItemResponse.empty("contact-refresh")));

        mockMvc.perform(as(get("/api/task-checklists")
                        .param("personId", "minseo")
                        .param("taskTitle", "비자 연장 집중기간"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[0].key").value("result-report"))
                .andExpect(jsonPath("$.items[0].completed").value(true))
                .andExpect(jsonPath("$.items[0].updatedBy").value("박민서"))
                .andExpect(jsonPath("$.items[1].updatedBy").isEmpty());
    }

    @Test
    void savesOneToggleAndAttributesItToTheSignedInAccount() throws Exception {
        when(service.update(
                eq("minseo"), eq("비자 연장 집중기간"), eq("schedule-share"), eq(true),
                eq(WebSliceConfig.MEMBER_NAME)))
                .thenReturn(new TaskChecklistItemResponse(
                        "schedule-share", true, WebSliceConfig.MEMBER_NAME, "2026-08-30T03:04:05.678Z"));

        mockMvc.perform(as(post("/api/task-checklists"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간",
                                 "itemKey":"schedule-share","completed":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.key").value("schedule-share"))
                .andExpect(jsonPath("$.item.completed").value(true))
                .andExpect(jsonPath("$.item.updatedBy").value(WebSliceConfig.MEMBER_NAME));
    }

    @Test
    void requiresASessionForReadsAndWrites() throws Exception {
        mockMvc.perform(get("/api/task-checklists"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
        mockMvc.perform(post("/api/task-checklists").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
    }
}
