package com.globalaffairs.handover.document;

import static com.globalaffairs.handover.support.Identity.as;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.globalaffairs.handover.support.WebSliceConfig;
import com.globalaffairs.handover.web.ApiException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** {@code /api/handover} must answer with the same statuses and Korean messages the Worker did. */
@WebMvcTest(DocumentController.class)
@Import(WebSliceConfig.class)
class DocumentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DocumentService service;

    private static DocumentResponse sample(String status) {
        return new DocumentResponse(
                "김지현",
                status,
                List.of(new DocumentResponse.Entry(
                        "r1",
                        "responsibility",
                        "체류 관리",
                        "<p>본문</p>",
                        Map.of("cycle", "수시"),
                        List.of(new DocumentResponse.Attachment("f1", "명단.xlsx", 2048, "", "")),
                        new DocumentResponse.Formatting("Pretendard", "16"))),
                List.of(new DocumentResponse.Bundle("b1", "체류·비자", List.of("r1"), null, "", "")),
                "2026-08-29T01:02:03.456Z",
                null,
                null,
                null);
    }

    @Test
    void answersFourOhOneWithoutASession() throws Exception {
        mockMvc.perform(get("/api/handover"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("로그인이 필요합니다."));
    }

    @Test
    void returnsTheCallersDocumentAndTheirRole() throws Exception {
        when(service.find(WebSliceConfig.MEMBER_EMAIL)).thenReturn(sample("draft"));

        mockMvc.perform(as(get("/api/handover"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewerRole").value("member"))
                .andExpect(jsonPath("$.document.status").value("draft"))
                .andExpect(jsonPath("$.document.entries[0].id").value("r1"))
                /* the frontend distinguishes a stored attachment by its empty url */
                .andExpect(jsonPath("$.document.entries[0].attachments[0].url").value(""))
                /* a null decision, not a missing key: the workspace reads bundle.decision directly */
                .andExpect(jsonPath("$.document.bundles[0].decision").value(nullValue()));
    }

    @Test
    void reportsAnAccountWithNothingSavedAsANullDocumentRatherThanAnError() throws Exception {
        when(service.find(WebSliceConfig.MEMBER_EMAIL)).thenReturn(null);

        mockMvc.perform(as(get("/api/handover"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document").value(nullValue()))
                .andExpect(jsonPath("$.viewerRole").value("member"));
    }

    @Test
    void letsAnAdministratorOpenSomeoneElsesDocument() throws Exception {
        when(service.find("author@example.com")).thenReturn(sample("pending"));

        mockMvc.perform(as(get("/api/handover").param("owner", "Author@Example.com"), WebSliceConfig.ADMIN_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewerRole").value("admin"))
                .andExpect(jsonPath("$.document.status").value("pending"));
    }

    @Test
    void refusesToShowOneAccountsDocumentToAnother() throws Exception {
        mockMvc.perform(as(get("/api/handover").param("owner", "author@example.com"), WebSliceConfig.MEMBER_ID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("다른 담당자의 인수인계서는 열 수 없습니다."));

        verify(service, never()).find(any());
    }

    @Test
    void savesTheWorkingDocument() throws Exception {
        when(service.save(eq(WebSliceConfig.MEMBER_EMAIL), any(), any())).thenReturn(sample("draft"));

        mockMvc.perform(as(put("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entries\":[],\"bundles\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("draft"));
    }

    @Test
    void reportsAConflictWhenTheDocumentIsFrozen() throws Exception {
        when(service.save(any(), any(), any()))
                .thenThrow(ApiException.conflict("검토 중인 문서는 수정할 수 없습니다."));

        mockMvc.perform(as(put("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entries\":[],\"bundles\":[]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("검토 중인 문서는 수정할 수 없습니다."));
    }

    @Test
    void submitsForTheSignedInAuthor() throws Exception {
        when(service.submit(WebSliceConfig.MEMBER_EMAIL)).thenReturn(sample("pending"));

        mockMvc.perform(as(post("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"submit\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("pending"));
    }

    @Test
    void startsTheNextAnnualDraftForTheSignedInAuthor() throws Exception {
        when(service.rollover(WebSliceConfig.MEMBER_EMAIL)).thenReturn(sample("draft"));

        mockMvc.perform(as(post("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"rollover\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("draft"));
    }

    @Test
    void onlyAPartLeaderMayReview() throws Exception {
        mockMvc.perform(as(post("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"review\",\"decisions\":[]}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("파트장 권한이 필요합니다."));

        verify(service, never()).review(any(), any(), any());
    }

    @Test
    void reviewsTheNamedAuthorsDocument() throws Exception {
        when(service.review(eq("author@example.com"), any(), any())).thenReturn(sample("approved"));

        mockMvc.perform(as(post("/api/handover"), WebSliceConfig.ADMIN_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"action":"review","ownerEmail":"Author@Example.com",
                                 "decisions":[{"bundleId":"b1","decision":"approved","comment":""}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.document.status").value("approved"));
    }

    @Test
    void rejectsAnActionItDoesNotKnow() throws Exception {
        mockMvc.perform(as(post("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"delete\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("알 수 없는 요청입니다."));
    }

    @Test
    void rejectsAPostWithNoActionAtAll() throws Exception {
        mockMvc.perform(as(post("/api/handover"), WebSliceConfig.MEMBER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("알 수 없는 요청입니다."));
    }
}
