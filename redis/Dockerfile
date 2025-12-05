FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends redis-server curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY redis/redis.conf /etc/redis/redis.conf

# Simple entrypoint that can run as primary or replica based on env vars.
RUN printf '#!/bin/sh\nset -e\nROLE=${REDIS_ROLE:-primary}\nPRIMARY_HOST=${REDIS_PRIMARY_HOST:-redis-primary-0.redis}\nPRIMARY_PORT=${REDIS_PRIMARY_PORT:-6379}\nCMD=\"redis-server /etc/redis/redis.conf\"\nif [ \"$ROLE\" = \"replica\" ]; then\n  exec sh -c \"$CMD --replicaof $PRIMARY_HOST $PRIMARY_PORT\"\nelse\n  exec sh -c \"$CMD\"\nfi\n' > /usr/local/bin/redis-entrypoint.sh && \
    chmod +x /usr/local/bin/redis-entrypoint.sh

EXPOSE 6379
VOLUME [\"/data\"]
ENTRYPOINT [\"/usr/local/bin/redis-entrypoint.sh\"]