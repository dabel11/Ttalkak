package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Component
public class ResendMailGateway {
    static final String ENDPOINT = "https://api.resend.com/emails";
    private final String apiKey;
    private final RestTemplate client;

    @Autowired
    public ResendMailGateway(@Value("${ttalkak.auth.resend-api-key:}") String apiKey) {
        this(apiKey, createClient());
    }

    ResendMailGateway(String apiKey, RestTemplate client) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.client = client;
    }

    private static RestTemplate createClient() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(5000);
        return new RestTemplate(factory);
    }

    public boolean isConfigured() {
        return !apiKey.isBlank();
    }

    public void send(String from, String email, String subject, String text) {
        if (!isConfigured()) throw failure();
        var headers = new HttpHeaders();
        headers.setBearerAuth(apiKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        var body = Map.of("from", from, "to", List.of(email), "subject", subject, "text", text);
        try {
            var response = client.postForEntity(ENDPOINT, new HttpEntity<>(body, headers), Delivery.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null
                    || response.getBody().id() == null || response.getBody().id().isBlank()) {
                throw failure();
            }
        } catch (RestClientException exception) {
            // Provider responses may contain addresses or reset codes. Never expose the cause/body.
            throw failure();
        }
    }

    private static ApiException failure() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "PASSWORD_RESET_DELIVERY_FAILED", "메일 발송에 실패했습니다. 잠시 후 다시 요청해주세요.");
    }

    public record Delivery(String id) {}
}
