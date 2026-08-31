package com.globalaffairs.handover.auth;

import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Hands controllers the {@link AuthenticatedUser} the filter resolved, or null when the request
 * carried no usable session. Controllers decide what an absent or unregistered user means, because
 * the original routes answered differently per endpoint (401 on most, 403 on member administration).
 */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return AuthenticatedUser.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer container,
            NativeWebRequest request,
            WebDataBinderFactory binderFactory) {
        return request.getAttribute(SessionAuthFilter.USER_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
    }
}
