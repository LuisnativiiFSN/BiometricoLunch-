# La imagen se construye desde C:\Users\dev05\Desktop\MarcacionComida:
# docker build -f BiometricoLunch-/apps/web/Dockerfile -t 10.0.40.10:5000/app-comedor-fsn-web:1.0.0 .

FROM node:24-bookworm-slim AS build
WORKDIR /src/BiometricoLunch-

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY BiometricoLunch-/package.json BiometricoLunch-/pnpm-lock.yaml BiometricoLunch-/pnpm-workspace.yaml ./
COPY BiometricoLunch-/apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @comedor/web...

COPY BiometricoLunch-/apps/web/ apps/web/
ARG VITE_API_URL=http://api-comedor-fsn.fasani.local/api
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @comedor/web build

FROM nginx:1.29-alpine AS runtime
COPY BiometricoLunch-/apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /src/BiometricoLunch-/apps/web/dist/ /usr/share/nginx/html/

RUN mkdir -p /tmp/nginx/client /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi && \
    chown -R nginx:nginx /tmp/nginx

EXPOSE 8080
USER nginx
CMD ["sh", "-c", "mkdir -p /tmp/nginx/client /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi && exec nginx -g 'daemon off;'"]
