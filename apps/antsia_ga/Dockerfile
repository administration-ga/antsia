# syntax=docker/dockerfile:1
# Image AUTOPORTANTE de l'application antsia_ga du moteur ANTSIA.
#
# Contexte de construction = le dossier ECOSYSTEMES (parent d'ANTSIA) : toutes
# les applications du moteur, y compris les applications externes de
# DIASPORALE, se construisent dans ce même contexte, avec UNE installation
# (celle d'ANTSIA). Fichier d'exclusion : Dockerfile.dockerignore, à côté.
#
#   docker build -f ANTSIA/apps/antsia_ga/Dockerfile \
#     --build-arg NEXT_PUBLIC_CONVEX_URL=… --build-arg NEXT_PUBLIC_SITE_URL=… \
#     -t antsia_ga .            # lancé depuis ECOSYSTEMES
#
# Les variables NEXT_PUBLIC_* sont inscrites dans le bundle à la construction :
# chacune est un ARG ci-dessous (cliquet deploy-catalog). Aucun secret en ARG.

# ── Étape 1 : dépendances et construction ─────────────────────────────────────
FROM oven/bun:1.4.2 AS builder
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BUILD_SHA
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN
ARG NEXT_PUBLIC_DEMO_ENTRY_ENABLED
ARG NEXT_PUBLIC_APP_BASE_PATH
ENV NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_BUILD_SHA=${NEXT_PUBLIC_BUILD_SHA} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST} \
    NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN=${NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN} \
    NEXT_PUBLIC_DEMO_ENTRY_ENABLED=${NEXT_PUBLIC_DEMO_ENTRY_ENABLED} \
    NEXT_PUBLIC_APP_BASE_PATH=${NEXT_PUBLIC_APP_BASE_PATH} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /src

COPY ANTSIA ./ANTSIA
# La racine d'ANTSIA dépend du domaine pur de DIASPORALE (tranche
# convex/modules/diaspora du moteur) : bun exige, même en installation élaguée,
# chaque espace de travail dont dépend un espace présent. Ce paquet seul suffit.
COPY DIASPORALE/packages/diasporale-domain ./DIASPORALE/packages/diasporale-domain
RUN cd ANTSIA && bun install --frozen-lockfile
RUN cd ANTSIA/apps/antsia_ga && bun run build

# ── Étape 2 : image d'exécution minimale (sortie standalone de Next) ─────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_DEMO_ENTRY_ENABLED=${NEXT_PUBLIC_DEMO_ENTRY_ENABLED} \
    NEXT_PUBLIC_APP_BASE_PATH=${NEXT_PUBLIC_APP_BASE_PATH} \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=builder --chown=node:node /src/ANTSIA/apps/antsia_ga/.next/standalone ./
COPY --from=builder --chown=node:node /src/ANTSIA/apps/antsia_ga/.next/static ./ANTSIA/apps/antsia_ga/.next/static
COPY --from=builder --chown=node:node /src/ANTSIA/apps/antsia_ga/public ./ANTSIA/apps/antsia_ga/public

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- "http://127.0.0.1:8080/api/sante-fonctionnelle" >/dev/null 2>&1 || exit 1
CMD ["node", "ANTSIA/apps/antsia_ga/server.js"]
