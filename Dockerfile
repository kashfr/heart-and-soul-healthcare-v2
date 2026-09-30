# Heart & Soul staff portal — Cloud Run image.
# Two-stage build: compile with the full toolchain, run the self-contained
# Next.js standalone bundle on a slim runtime. Secrets/config arrive as env
# vars at deploy time (Secret Manager) — nothing sensitive is baked in, and
# NEXT_PUBLIC_* values are provided as build args (they compile into the
# client bundle, same as on Vercel).

FROM node:22-alpine AS builder
WORKDIR /app

# Public (client-side) Firebase config — compiled into the JS bundle.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
# Deployed-version stamp for /api/version (Cloud Build passes the commit).
ARG APP_COMMIT
ARG APP_BUILD_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# When this image was built, read by /api/version at request time.
RUN date -u +"%Y-%m-%dT%H:%M:%SZ" > /app/built-at.txt

FROM node:22-alpine AS runner
WORKDIR /app
ARG APP_COMMIT
ARG APP_BUILD_ID
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    APP_COMMIT=$APP_COMMIT \
    APP_BUILD_ID=$APP_BUILD_ID

# Non-root runtime user (Cloud Run best practice).
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/built-at.txt ./built-at.txt

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
