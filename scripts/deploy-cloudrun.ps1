$ErrorActionPreference = "Stop"

$PROJECT_ID = "website-c3acf"
$REGION = "us-central1"
$SERVICE = "sosun-fihaara"
$REPO = "cloud-run-source-deploy"

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Error "Refusing to deploy: the working tree has uncommitted or untracked changes."
    exit 1
}

$GIT_SHA = (git rev-parse --short HEAD).Trim()
$IMAGE = "us-central1-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:${GIT_SHA}"

# Load .env.local variables
if (Test-Path ".env.local") {
    Get-Content ".env.local" | Where-Object { $_ -match "^[A-Za-z0-9_]+=" } | ForEach-Object {
        $name, $value = $_ -split '=', 2
        Set-Item -Path "env:$name" -Value $value.Trim()
    }
}

$PUBLIC_FIREBASE_API_KEY = $env:PUBLIC_FIREBASE_API_KEY
$PUBLIC_FIREBASE_AUTH_DOMAIN = $env:PUBLIC_FIREBASE_AUTH_DOMAIN
$PUBLIC_FIREBASE_PROJECT_ID = $env:PUBLIC_FIREBASE_PROJECT_ID
$FIREBASE_STORAGE_BUCKET = $env:FIREBASE_STORAGE_BUCKET

Write-Host "==> Building ${IMAGE}"
gcloud builds submit `
  --project $PROJECT_ID `
  --config cloudbuild.yaml `
  --substitutions="_PUBLIC_FIREBASE_API_KEY=$PUBLIC_FIREBASE_API_KEY,_PUBLIC_FIREBASE_AUTH_DOMAIN=$PUBLIC_FIREBASE_AUTH_DOMAIN,_PUBLIC_FIREBASE_PROJECT_ID=$PUBLIC_FIREBASE_PROJECT_ID,_IMAGE_TAG=$GIT_SHA" `
  .

Write-Host "==> Deploying ${IMAGE}"
gcloud run deploy $SERVICE `
  --project $PROJECT_ID `
  --region $REGION `
  --image $IMAGE `
  --min-instances=0 --max-instances=10 --memory=512Mi --cpu=1 `
  --concurrency=80 --timeout=30s --allow-unauthenticated `
  --set-env-vars="FIREBASE_STORAGE_BUCKET=$FIREBASE_STORAGE_BUCKET" `
  --quiet

Write-Host "==> Verifying the new revision is healthy"
$SERVICE_URL = (gcloud run services describe $SERVICE --project $PROJECT_ID --region $REGION --format='value(status.url)').Trim()

$response = Invoke-WebRequest -Uri "$SERVICE_URL/api/health" -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($response.StatusCode -eq 200) {
    Write-Host "==> Healthy. Deployed ${IMAGE} (commit ${GIT_SHA})."
} else {
    Write-Error "==> Health check FAILED after deploy."
    exit 1
}
