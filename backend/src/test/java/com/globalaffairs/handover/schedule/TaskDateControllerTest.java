package com.globalaffairs.handover.schedule;

import static com.globalaffairs.handover.support.Identity.as;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

@WebMvcTest(TaskDateController.class)
@Import(WebSliceConfig.class)
class TaskDateControllerTest {

    private static final String KEY = "minseo::비자 연장 집중기간";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskDateService service;

    private static TaskDateResponse response(Long id, String date, String label) {
        return new TaskDateResponse(
                id, KEY, "minseo", "비자 연장 집중기간", date, label, "박민서", "2026-08-30T03:04:05.678Z");
    }

    @Test
    void listsEveryConfirmedDateWhenNoTaskIsNamed() throws Exception {
        when(service.dates()).thenReturn(List.of(
                response(1L, "2026-08-20", "단체접수 1차"),
                response(2L, "2026-09-03", "단체접수 2차")));

        mockMvc.perform(as(get("/api/task-dates"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dates.length()").value(2))
                .andExpect(jsonPath("$.dates[0].date").value("2026-08-20"))
                .andExpect(jsonPath("$.dates[0].label").value("단체접수 1차"))
                .andExpect(jsonPath("$.dates[0].taskKey").value(KEY));
    }

    @Test
    void narrowsToOneTaskWhenItIsNamed() throws Exception {
        when(service.dates("minseo", "비자 연장 집중기간"))
                .thenReturn(List.of(response(1L, "2026-08-20", "단체접수 1차")));

        mockMvc.perform(as(get("/api/task-dates")
                        .param("personId", "minseo")
                        .param("taskTitle", "비자 연장 집중기간"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dates.length()").value(1));
        verify(service, never()).dates();
    }

    @Test
    void savesOneDateAndAttributesItToTheSignedInAccount() throws Exception {
        when(service.add(
                eq("minseo"), eq("비자 연장 집중기간"), eq("2026-08-20"), eq("단체접수 1차"),
                eq(WebSliceConfig.MEMBER_NAME)))
                .thenReturn(response(1L, "2026-08-20", "단체접수 1차"));

        mockMvc.perform(as(post("/api/task-dates"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간",
                                 "date":"2026-08-20","label":"단체접수 1차"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.date.date").value("2026-08-20"))
                .andExpect(jsonPath("$.date.label").value("단체접수 1차"));
        verify(service, never()).addAll(any(), any(), any(), any());
    }

    /** A paste takes the batch branch, and the reply is a list rather than the single-date object. */
    @Test
    void savesAPastedBatchThroughTheBatchBranch() throws Exception {
        when(service.addAll(
                eq("minseo"), eq("비자 연장 집중기간"),
                eq(List.of(
                        new TaskDateService.NewDate("2026-08-20", "단체접수 1차"),
                        new TaskDateService.NewDate("2026-09-03", "단체접수 2차"))),
                eq(WebSliceConfig.MEMBER_NAME)))
                .thenReturn(List.of(
                        response(1L, "2026-08-20", "단체접수 1차"),
                        response(2L, "2026-09-03", "단체접수 2차")));

        mockMvc.perform(as(post("/api/task-dates"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","dates":[
                                  {"date":"2026-08-20","label":"단체접수 1차"},
                                  {"date":"2026-09-03","label":"단체접수 2차"}]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dates.length()").value(2))
                .andExpect(jsonPath("$.dates[1].date").value("2026-09-03"));
        verify(service, never()).add(any(), any(), any(), any(), any());
    }

    /**
     * An empty list is not a batch of nothing, it is a request with no day in it — so it takes the
     * single-add branch and comes back with that branch's message rather than a 201 holding nothing.
     */
    @Test
    void sendsAnEmptyBatchDownTheSingleAddBranch() throws Exception {
        when(service.add(eq("minseo"), eq("비자 연장 집중기간"), eq(null), eq(null), any()))
                .thenReturn(response(1L, "2026-08-20", ""));

        mockMvc.perform(as(post("/api/task-dates"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personId":"minseo","taskTitle":"비자 연장 집중기간","dates":[]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.date").exists());
        verify(service, never()).addAll(any(), any(), any(), any());
    }

    @Test
    void removesOneDateById() throws Exception {
        mockMvc.perform(as(delete("/api/task-dates"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":4}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
        verify(service).delete(4L);
    }

    @Test
    void requiresASessionForReadsAndWrites() throws Exception {
        mockMvc.perform(get("/api/task-dates"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
        mockMvc.perform(post("/api/task-dates").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
        mockMvc.perform(delete("/api/task-dates").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
    }
}
