package com.globalaffairs.handover.web;

import org.springframework.http.HttpStatus;

/**
 * A failure that must reach the browser as the existing frontend expects it: a JSON body of
 * {@code {"error": "..."}} carrying the original Korean message, under the original status code.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, message);
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }

    /** Nothing is stored under the key the caller asked for. */
    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message);
    }

    /** The request is well formed but the document is not in a state that allows it. */
    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message);
    }

    /** The caller is being asked to slow down — repeated wrong passwords, or reset codes on demand. */
    public static ApiException tooManyRequests(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, message);
    }

    /** The feature is not configured on this deployment, e.g. no OpenAI key. */
    public static ApiException unavailable(String message) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, message);
    }

    /** An upstream call failed or answered in a shape we could not read. */
    public static ApiException badGateway(String message) {
        return new ApiException(HttpStatus.BAD_GATEWAY, message);
    }
}
