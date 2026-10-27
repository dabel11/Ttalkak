package com.ttalkak.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.common.exception.ApiErrorWriter;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.startup.Tomcat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class AuthEncodedPathBoundaryTest {
    @Test void decodedAuthenticationPathsCannotBypassStrictGate(@TempDir Path directory) throws Exception {
        var properties = new ServerProperties();
        properties.setForwardHeadersStrategy(ServerProperties.ForwardHeadersStrategy.NONE);
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters", true, properties, (address, path) -> true);
        var reached = new AtomicInteger();
        var tomcat = new Tomcat();
        tomcat.setBaseDir(directory.resolve("tomcat").toString());
        tomcat.setPort(0);
        tomcat.getConnector().setProperty("address", "127.0.0.1");
        var context = tomcat.addContext("", Files.createDirectory(directory.resolve("root")).toString());
        Tomcat.addServlet(context, "probe", new HttpServlet() {
            @Override protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
                try {
                    filter.doFilter(request, response, (req, resp) -> {
                        reached.incrementAndGet();
                        resp.getWriter().write("unprotected probe");
                    });
                } catch (jakarta.servlet.ServletException ex) { throw new IOException(ex); }
            }
        });
        context.addServletMappingDecoded("/*", "probe");
        try {
            tomcat.start();
            var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            String origin = "http://127.0.0.1:" + tomcat.getConnector().getLocalPort();
            for (String path : new String[]{"/api/auth/%66ind-id", "/%61pi/auth/find-id", "/api/auth/%6cogin"}) {
                var request = HttpRequest.newBuilder(URI.create(origin + path)).timeout(Duration.ofSeconds(5))
                        .POST(HttpRequest.BodyPublishers.noBody()).build();
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertEquals(503, response.statusCode(), "decoded route must remain protected: " + path);
                assertTrue(response.body().contains("AUTH_PROXY_REQUIRED"));
            }
            assertEquals(0, reached.get());
        } finally { try { tomcat.stop(); } finally { tomcat.destroy(); } }
    }
}
