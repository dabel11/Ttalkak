FROM node:24-alpine AS build
WORKDIR /app
COPY prompt-hub-web-frontend/package*.json ./prompt-hub-web-frontend/
RUN cd prompt-hub-web-frontend && npm ci
COPY scripts ./scripts
COPY shared ./shared
COPY prompt-hub-web-frontend/index.html ./prompt-hub-web-frontend/index.html
COPY prompt-hub-web-frontend/src ./prompt-hub-web-frontend/src
RUN cd prompt-hub-web-frontend && npm run build:prod
# Set the API origin before the application module runs. This also works behind HTTPS.
RUN node -e 'const fs = require("node:fs"); const path = "prompt-hub-web-frontend/dist/index.html"; const html = fs.readFileSync(path, "utf8"); if (!html.includes("<head>")) throw new Error("Missing HTML head"); fs.writeFileSync(path, html.replace("<head>", "<head><script>window.TTALKAK_API_BASE_URL = window.location.origin;</script>"));'

FROM nginx:stable-alpine
ENV PORT=80 BACKEND_UPSTREAM=backend:8080 PROXY_READ_TIMEOUT=90s
ENV NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_UPSTREAM|PROXY_READ_TIMEOUT|DNS_RESOLVER)$"
COPY docker/nginx-server.conf /etc/nginx/templates/default.conf.template
COPY docker/19-server-env.envsh /docker-entrypoint.d/19-server-env.envsh
RUN chmod +x /docker-entrypoint.d/19-server-env.envsh
COPY --from=build /app/prompt-hub-web-frontend/dist /usr/share/nginx/html
EXPOSE 80
