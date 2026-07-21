# backend (Spring Boot 3 · Java 17) — 멀티스테이지 빌드
# 1) build: gradlew 로 실행가능 bootJar 생성 (테스트 제외)
FROM eclipse-temurin:17-jdk AS build
WORKDIR /app
# 의존성 메타 먼저 복사 (레이어 캐시)
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
COPY src ./src
RUN chmod +x gradlew && ./gradlew --no-daemon clean bootJar -x test

# 2) run: JRE 런타임만 (이미지 경량화)
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/build/libs/backend-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
# DB/RAG/JWT 등은 compose 의 environment·env_file 로 주입
ENTRYPOINT ["java", "-jar", "app.jar"]
