package com.globalaffairs.handover.schedule;

import static com.globalaffairs.handover.support.Identity.as;
import static com.globalaffairs.handover.support.Identity.withFullName;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** {@code /api/schedules} — the response shape the calendar view replays its history from. */
@WebMvcTest(ScheduleController.class)
@Import(WebSliceConfig.class)
class ScheduleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ScheduleService service;

    @Test
    void returnsTheTrailUnderTheFieldNamesTheFrontendReads() throws Exception {
        when(service.changes()).thenReturn(List.of(new ScheduleChangeResponse(
                "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                21, 23, "출입국 일정 변경", "박민서", "2026-08-29T01:02:03.456Z")));

        mockMvc.perform(as(get("/api/schedules"), WebSliceConfig.MEMBER_EMAIL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changes[0].taskKey").value("minseo::비자 연장 집중기간"))
                .andExpect(jsonPath("$.changes[0].personId").value("minseo"))
                .andExpect(jsonPath("$.changes[0].taskTitle").value("비자 연장 집중기간"))
                .andExpect(jsonPath("$.changes[0].fromStart").value(21))
                .andExpect(jsonPath("$.changes[0].toStart").value(23))
                .andExpect(jsonPath("$.changes[0].reason").value("출입국 일정 변경"))
                .andExpect(jsonPath("$.changes[0].changedBy").value("박민서"))
                .andExpect(jsonPath("$.changes[0].changedAt").value("2026-08-29T01:02:03.456Z"));
    }

    @Test
    void answersFourOhOneWithoutIdentityHeaders() throws Exception {
        mockMvc.perform(get("/api/schedules"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
    }

    @Test
    void attributesTheChangeToTheProxySuppliedDisplayName() throws Exception {
        when(service.record(eq("minseo"), eq("비자 연장 집중기간"), eq(23), eq("사유입니다"), eq("박민서")))
                .thenReturn(new ScheduleChangeResponse(
                        "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                        21, 23, "사유입니다", "박민서", "2026-08-29T01:02:03.456Z"));

        mockMvc.perform(withFullName(as(post("/api/schedules"), WebSliceConfig.MEMBER_EMAIL), "박민서")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\",\"taskTitle\":\"비자 연장 집중기간\",\"toStart\":23,\"reason\":\"사유입니다\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.change.fromStart").value(21))
                .andExpect(jsonPath("$.change.changedBy").value("박민서"));
    }

    @Test
    void fallsBackToTheEmailWhenTheProxySentNoDecodableName() throws Exception {
        when(service.record(eq("minseo"), eq("비자 연장 집중기간"), eq(23), eq("사유입니다"), eq(WebSliceConfig.MEMBER_EMAIL)))
                .thenReturn(new ScheduleChangeResponse(
                        "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                        21, 23, "사유입니다", WebSliceConfig.MEMBER_EMAIL, "2026-08-29T01:02:03.456Z"));

        mockMvc.perform(as(post("/api/schedules"), WebSliceConfig.MEMBER_EMAIL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\",\"taskTitle\":\"비자 연장 집중기간\",\"toStart\":23,\"reason\":\"사유입니다\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.change.changedBy").value(WebSliceConfig.MEMBER_EMAIL));
    }

    @Test
    void surfacesAValidationFailureAsFourHundredWithItsOwnMessage() throws Exception {
        when(service.record(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any()))
                .thenThrow(ApiException.badRequest("현재와 동일한 일정입니다."));

        mockMvc.perform(as(post("/api/schedules"), WebSliceConfig.MEMBER_EMAIL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personId\":\"minseo\",\"taskTitle\":\"비자 연장 집중기간\",\"toStart\":21,\"reason\":\"사유입니다\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("현재와 동일한 일정입니다."));
    }
}
