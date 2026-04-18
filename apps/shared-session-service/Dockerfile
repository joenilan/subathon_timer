FROM oven/bun:1-alpine

WORKDIR /app

# Copy the service and the desktop lib files it imports from
COPY apps/shared-session-service/ ./apps/shared-session-service/
COPY apps/desktop/src/lib/ ./apps/desktop/src/lib/

WORKDIR /app/apps/shared-session-service

RUN bun install --frozen-lockfile 2>/dev/null || bun install

ENV SHARED_SESSION_HOST=0.0.0.0
ENV SHARED_SESSION_PORT=31947
ENV SHARED_SESSION_MAX_PARTICIPANTS=6

CMD ["bun", "src/server.ts"]
