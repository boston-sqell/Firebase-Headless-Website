#!/usr/bin/env bash
#
# Builds and deploys the Cloud Run service, tagging the image by git commit
# SHA instead of a floating tag so every deploy is traceable back to an
# exact commit and trivially rollback-able. Run via `npm run deploy:cloudrun`
# (invoked from the repo root).
#
# This replaces the old one-liner that built and deployed an implicitly
# "latest"-tagged image with no record of which commit produced it and no
# post-deploy check that anything actually came up healthy.

set -euo pipefail

PROJECT_ID="website-c3acf"
REGION="us-central1"
SERVICE="sosun-fihaara"
REPO="cloud-run-source-deploy"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy: the working tree has uncommitted or untracked changes." >&2
  echo "Commit everything first -- otherwise the image we tag by commit SHA doesn't" >&2
  echo "actually reflect what's in git history, which defeats the point." >&2
  echo >&2
  git status --porcelain >&2
  exit 1
fi

GIT_SHA="$(git rev-parse --short HEAD)"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:${GIT_SHA}"

# Pull in PUBLIC_FIREBASE_* for the build args (Dockerfile inlines these into
# the client bundle at build time -- see Dockerfile comments).
set -a
# shellcheck disable=SC1091
source .env.local
set +a

# Record what's live right now so we can print an exact rollback command if
# the new deploy doesn't come up healthy.
PREVIOUS_IMAGE="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true)"
if [[ -n "$PREVIOUS_IMAGE" ]]; then
  echo "==> Current live image (rollback target if this deploy fails): ${PREVIOUS_IMAGE}"
fi

echo "==> Building ${IMAGE}"
gcloud builds submit \
  --project "$PROJECT_ID" \
  --config cloudbuild.yaml \
  --substitutions="_PUBLIC_FIREBASE_API_KEY=${PUBLIC_FIREBASE_API_KEY},_PUBLIC_FIREBASE_AUTH_DOMAIN=${PUBLIC_FIREBASE_AUTH_DOMAIN},_PUBLIC_FIREBASE_PROJECT_ID=${PUBLIC_FIREBASE_PROJECT_ID},_IMAGE_TAG=${GIT_SHA}" \
  .

echo "==> Deploying ${IMAGE}"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --min-instances=0 --max-instances=10 --memory=512Mi --cpu=1 \
  --concurrency=80 --timeout=30s --allow-unauthenticated \
  --set-env-vars="FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}" \
  --quiet

echo "==> Verifying the new revision is healthy"
SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

if curl -sf --max-time 10 "${SERVICE_URL}/api/health" > /dev/null; then
  echo "==> Healthy. Deployed ${IMAGE} (commit ${GIT_SHA})."
else
  echo "==> Health check FAILED after deploy." >&2
  if [[ -n "$PREVIOUS_IMAGE" ]]; then
    echo "==> Roll back with:" >&2
    echo "    gcloud run deploy $SERVICE --project $PROJECT_ID --region $REGION --image $PREVIOUS_IMAGE --quiet" >&2
  else
    echo "==> No previous image on record to roll back to -- check Cloud Run logs." >&2
  fi
  exit 1
fi
