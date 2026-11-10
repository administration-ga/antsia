# Dupliqué de socle/ops/clamav/Dockerfile @ 4e1b625040c5f962f166ed74a691f5cee0126e27 — adaptations : façade ANTSIA, une analyse à la fois, mémoire de rechargement bornée, pas de npm.
FROM clamav/clamav:1.4

RUN apk add --no-cache nodejs
WORKDIR /srv
COPY server.mjs /srv/server.mjs
COPY entrypoint.sh /srv/entrypoint.sh
RUN chmod +x /srv/entrypoint.sh

ENV PORT=8080 \
    HTTP2=true \
    HEALTH_PORT=8081 \
    CLAMD_HOST=127.0.0.1 \
    CLAMD_PORT=3310 \
    MAX_BYTES=62914560 \
    SCAN_TIMEOUT_MS=45000 \
    BODY_TIMEOUT_MS=15000 \
    HEALTH_TIMEOUT_MS=5000 \
    CLAMAV_NO_CLAMD=false \
    CLAMAV_NO_FRESHCLAMD=false \
    CLAMAV_NO_MILTERD=true \
    FRESHCLAM_CHECKS=12 \
    CLAMD_CONF_MaxThreads=1 \
    CLAMD_CONF_MaxQueue=2 \
    CLAMD_CONF_StreamMaxLength=60M \
    CLAMD_CONF_MaxScanSize=60M \
    CLAMD_CONF_MaxFileSize=60M \
    CLAMD_CONF_AlertExceedsMax=yes \
    CLAMD_CONF_ConcurrentDatabaseReload=no

EXPOSE 8080 8081
ENTRYPOINT ["/srv/entrypoint.sh"]
