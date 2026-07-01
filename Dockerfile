# Pinned by digest (not just the floating "20-slim" tag) so the exact same
# base image bytes are used on every build -- a tag can be repointed to a
# different image at any time, which is what "digest-pin the base image"
# means here. To refresh when a new Node 20 patch/security release ships:
#   TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/node:pull" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
#   curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.oci.image.index.v1+json" \
#     https://registry-1.docker.io/v2/library/node/manifests/20-slim -D - -o /dev/null | grep -i docker-content-digest
FROM node:22-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Public (non-secret) Firebase client config -- Astro/Vite inlines these into
# the client JS bundle at build time, so they must be present as env vars
# during `npm run build`, not just at container runtime.
ARG PUBLIC_FIREBASE_API_KEY
ARG PUBLIC_FIREBASE_AUTH_DOMAIN
ARG PUBLIC_FIREBASE_PROJECT_ID
ENV PUBLIC_FIREBASE_API_KEY=$PUBLIC_FIREBASE_API_KEY
ENV PUBLIC_FIREBASE_AUTH_DOMAIN=$PUBLIC_FIREBASE_AUTH_DOMAIN
ENV PUBLIC_FIREBASE_PROJECT_ID=$PUBLIC_FIREBASE_PROJECT_ID

RUN npm run build

# ---- Runtime ----
FROM node:22-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4

WORKDIR /app

# Run as a non-root user inside the container.
RUN groupadd --system app && useradd --system --gid app --home-dir /app app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app server.mjs ./

USER app

ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# server.mjs wraps dist/server/entry.mjs to add graceful SIGTERM/SIGINT
# handling for Cloud Run's stop signal -- see server.mjs for why this
# can't just be `node ./dist/server/entry.mjs` directly.
CMD ["node", "./server.mjs"]
