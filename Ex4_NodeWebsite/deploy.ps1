Write-Host ""
Write-Host "========================================="
Write-Host " Building Docker image..."
Write-Host "========================================="
docker build -t gip37/node-website:latest .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed!"
    exit 1
}

Write-Host ""
Write-Host "========================================="
Write-Host " Pushing image to Docker Hub..."
Write-Host "========================================="
docker push gip37/node-website:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker push failed!"
    exit 1
}

Write-Host ""
Write-Host "========================================="
Write-Host " Restarting Kubernetes deployment..."
Write-Host "========================================="
kubectl rollout restart deployment node-app

if ($LASTEXITCODE -ne 0) {
    Write-Host "Kubernetes rollout failed!"
    exit 1
}

Write-Host ""
Write-Host "========================================="
Write-Host " Waiting for rollout to complete..."
Write-Host "========================================="
kubectl rollout status deployment node-app

Write-Host ""
Write-Host "========================================="
Write-Host " Starting port-forward..."
Write-Host "========================================="
Write-Host "Press CTRL+C to stop."

kubectl port-forward service/node-service 3000:3000