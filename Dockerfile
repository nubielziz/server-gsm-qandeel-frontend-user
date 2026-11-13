# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:26-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ARG GSM_API_ORIGIN
ARG GSM_API_REWRITE_ORIGIN=http://api:3000
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_TIME_ZONE=UTC
ARG NEXT_PUBLIC_API_PUBLIC_URL=
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
    GSM_API_ORIGIN=${GSM_API_ORIGIN} GSM_API_REWRITE_ORIGIN=${GSM_API_REWRITE_ORIGIN} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_TIME_ZONE=${NEXT_PUBLIC_TIME_ZONE} \
    NEXT_PUBLIC_API_PUBLIC_URL=${NEXT_PUBLIC_API_PUBLIC_URL}
RUN test -n "$GSM_API_ORIGIN" && test -n "$NEXT_PUBLIC_SITE_URL" && test -n "$NEXT_PUBLIC_TURNSTILE_SITE_KEY"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 GSM_API_ORIGIN=http://api:3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
