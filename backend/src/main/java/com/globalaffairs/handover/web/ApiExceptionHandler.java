package com.globalaffairs.handover.web;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Renders every failure as {@code {"error": "..."}}, the only error shape the existing frontend
 * reads. Messages are the Korean strings the Next.js routes returned, so the UI copy is unchanged.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handleApi(ApiException failure) {
        return ResponseEntity.status(failure.status()).body(Map.of("error", failure.getMessage()));
    }

    /**
     * A body that is not JSON at all. The Next.js routes threw here and answered 500; this returns
     * the 400 the shape of the request deserves, which the frontend renders as a normal error.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadableBody(HttpMessageNotReadableException failure) {
        log.debug("unreadable request body", failure);
        return ResponseEntity.badRequest().body(Map.of("error", "요청 형식을 읽지 못했습니다."));
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentSave(
            ObjectOptimisticLockingFailureException failure) {
        log.info("handover document was changed concurrently", failure);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "다른 화면에서 문서가 먼저 변경되었습니다. 새로고침 후 다시 저장해 주세요."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception failure) {
        log.error("unhandled request failure", failure);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }
}
