package com.ttalkak.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.common.exception.ApiErrorWriter;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.startup.Tomcat;
import org.apache.catalina.valves.RemoteIpValve;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class AuthNativeForwardingBoundaryTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(ForwardingProperties.class)
            .withPropertyValues("server.forward-headers-strategy=none")
            .withBean(ApiErrorWriter.class, () -> new ApiErrorWriter(new ObjectMapper()))
            .withBean(AuthRateLimitFilter.class);

    @Test void nativeForwardingMustFailConfigurationBeforeAcceptingAuthRequests() {
        context.withPropertyValues("server.forward-headers-strategy=native").run(app -> {
            assertThat(app).hasFailed();
            assertThat(app.getStartupFailure()).hasRootCauseMessage(
                    "Native forwarded headers cannot preserve the authentication socket peer; use explicit none/framework without Tomcat remoteip headers");
        });
    }

    @Test void supportedForwardingStrategiesStillConstructTheFilter() {
        for (String strategy : new String[]{"none", "framework"}) {
            context.withPropertyValues("server.forward-headers-strategy=" + strategy)
                    .run(app -> assertThat(app).hasNotFailed().hasSingleBean(AuthRateLimitFilter.class));
        }
    }

    @Test void explicitTomcatHeadersCannotEnableNativeValveUnderSupportedStrategies() {
        for (String strategy : new String[]{"none", "framework"}) {
            for (String header : new String[]{"remote-ip-header=X-Forwarded-For", "protocol-header=X-Forwarded-Proto"}) {
                context.withPropertyValues("server.forward-headers-strategy=" + strategy,
                        "server.tomcat.remoteip." + header).run(app -> assertThat(app).hasFailed());
            }
        }
    }

    @Test void implicitCloudStrategyIsNotAcceptedAsAnExplicitSocketPeerGuarantee() {
        context.withPropertyValues("server.forward-headers-strategy=")
                .run(app -> assertThat(app).hasFailed());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ServerProperties.class)
    static class ForwardingProperties { }

    @Test void nativeValveChangesEvenTheInnermostPeerBeforeTheFilter(@TempDir Path directory) throws Exception {
        // Real loopback Tomcat, no Spring application, database, accounts, or mail.
        // Demonstrate why servlet unwrapping cannot secure native forwarding.
        var tomcat = new Tomcat();
        tomcat.setBaseDir(directory.resolve("tomcat").toString());
        tomcat.setPort(0);
        tomcat.getConnector().setProperty("address", "127.0.0.1");
        var root = Files.createDirectory(directory.resolve("root"));
        var servletContext = tomcat.addContext("", root.toString());
        var valve = new RemoteIpValve();
        valve.setRemoteIpHeader("x-forwarded-for");
        valve.setInternalProxies("127\\.0\\.0\\.1");
        tomcat.getEngine().getPipeline().addValve(valve);
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper()));
        Tomcat.addServlet(servletContext, "probe", new HttpServlet() {
            @Override protected void doPost(HttpServletRequest request, HttpServletResponse response)
                    throws IOException {
                try {
                    filter.doFilter(request, response, (req, resp) -> resp.getWriter().write(
                            AuthRateLimitFilter.unforwardedPeerAddress((HttpServletRequest) req)));
                } catch (jakarta.servlet.ServletException ex) {
                    throw new IOException(ex);
                }
            }
        });
        servletContext.addServletMappingDecoded("/api/auth/find-id", "probe");
        try {
            tomcat.start();
            var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            URI uri = URI.create("http://127.0.0.1:" + tomcat.getConnector().getLocalPort()
                    + "/api/auth/find-id");
            for (int i = 1; i <= 11; i++) {
                String forged = "203.0.113." + i;
                var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5))
                        .header("X-Forwarded-For", forged).POST(HttpRequest.BodyPublishers.noBody()).build();
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(response.body()).isEqualTo(forged);
            }
        } finally {
            try { tomcat.stop(); } finally { tomcat.destroy(); }
        }
    }
}
