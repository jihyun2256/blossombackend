# Payment API Deployment Guide
# 결제 API 배포 가이드

This guide covers deployment options for the Payment API service.

## Prerequisites

- Docker and Docker Compose installed
- Kubernetes cluster (for K8s deployment)
- MySQL database (local or cloud-based like AWS Aurora)
- Environment variables configured

## Environment Setup

### 1. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

**Important:** Generate secure random values for secrets:

```bash
# Generate JWT Secret (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Encryption Key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Encryption IV (16 bytes)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Update the following critical variables in `.env`:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET` (minimum 32 characters)
- `ENCRYPTION_KEY` (64 hex characters / 32 bytes)
- `ENCRYPTION_IV` (32 hex characters / 16 bytes)
- `CORS_ORIGIN` (set to your domain in production)
- `ENFORCE_HTTPS=true` (in production)

## Deployment Options

### Option 1: Docker Compose (Recommended for Development/Testing)

The `docker-compose.payments.yml` file includes:
- MySQL database container
- Payment API container
- Nginx reverse proxy (optional)

**Start the services:**

```bash
# From the project root
docker-compose -f docker-compose.payments.yml up -d
```

**Check service status:**

```bash
docker-compose -f docker-compose.payments.yml ps
```

**View logs:**

```bash
docker-compose -f docker-compose.payments.yml logs -f payments-api
```

**Stop services:**

```bash
docker-compose -f docker-compose.payments.yml down
```

**Environment Variables:**

You can override environment variables using a `.env` file in the project root or by setting them in your shell:

```bash
export DB_PASSWORD=secure_password
export JWT_SECRET=your_secure_jwt_secret
export ENCRYPTION_KEY=your_64_char_hex_encryption_key
export ENCRYPTION_IV=your_32_char_hex_iv
```

### Option 2: Kubernetes (Production)

The `kubernetes/payments-api.yaml` includes:
- ConfigMap for non-sensitive configuration
- Secret for sensitive data (DB credentials, JWT, encryption keys)
- Deployment with 3 replicas
- Service (ClusterIP)
- HorizontalPodAutoscaler (3-10 pods)
- PodDisruptionBudget
- NetworkPolicy

**Before deploying:**

1. **Update the Secret** with your actual values:

```bash
# Edit kubernetes/payments-api.yaml
# Update the Secret section with base64-encoded values or use stringData
```

2. **Build and push Docker image:**

```bash
# Build the image
docker build -f payment/Dockerfile -t your-registry/payments-api:latest .

# Push to your registry (ECR, Docker Hub, etc.)
docker push your-registry/payments-api:latest
```

3. **Update image reference** in `kubernetes/payments-api.yaml`:

```yaml
image: your-registry/payments-api:latest
```

**Deploy to Kubernetes:**

```bash
# Apply the configuration
kubectl apply -f kubernetes/payments-api.yaml

# Check deployment status
kubectl get deployments payments-api
kubectl get pods -l app=payments-api

# Check service
kubectl get service payments-api

# View logs
kubectl logs -l app=payments-api -f
```

**Verify deployment:**

```bash
# Port forward to test locally
kubectl port-forward service/payments-api 3004:3004

# Test health endpoint
curl http://localhost:3004/health
```

### Option 3: Standalone Docker

**Build the image:**

```bash
docker build -f payment/Dockerfile -t payments-api:latest .
```

**Run the container:**

```bash
docker run -d \
  --name payments-api \
  -p 3004:3004 \
  -e DB_HOST=your-db-host \
  -e DB_USER=your-db-user \
  -e DB_PASSWORD=your-db-password \
  -e DB_NAME=your-db-name \
  -e JWT_SECRET=your-jwt-secret \
  -e ENCRYPTION_KEY=your-encryption-key \
  -e ENCRYPTION_IV=your-encryption-iv \
  -e NODE_ENV=production \
  -e ENFORCE_HTTPS=true \
  payments-api:latest
```

## Database Setup

### Initialize Database

The application can auto-initialize the database if `AUTO_INIT_DB=true` is set (development only).

For production, manually run the schema:

```bash
# Connect to your MySQL database
mysql -h your-db-host -u your-db-user -p your-db-name < payment/db/schema.sql
```

### Database Migrations

If you need to run migrations:

```bash
# From the payment directory
node db/migrations.js
```

## Health Checks

The API provides two health check endpoints:

- `GET /health` - Basic health check
- `GET /readiness` - Readiness check (includes DB connection test)

## Security Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Set `ENFORCE_HTTPS=true`
- [ ] Configure specific `CORS_ORIGIN` (not `*`)
- [ ] Generate strong random values for all secrets
- [ ] Use different secrets for each environment
- [ ] Store production secrets in secure vaults (AWS Secrets Manager, HashiCorp Vault)
- [ ] Enable rate limiting (`ENABLE_RATE_LIMITING=true`)
- [ ] Configure proper database credentials with limited privileges
- [ ] Set up SSL/TLS for database connections
- [ ] Review and update resource limits in Kubernetes
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Enable network policies in Kubernetes
- [ ] Regularly rotate secrets

## Monitoring

### Logs

Logs are written to:
- Console (stdout/stderr)
- File: `/var/log/payments-api/payments.log` (if configured)

All logs automatically mask sensitive information (card numbers, CVV, passwords, etc.).

### Metrics

The API exposes metrics at `/metrics` (if enabled) for Prometheus scraping.

### Kubernetes Monitoring

```bash
# Check pod status
kubectl get pods -l app=payments-api

# Check HPA status
kubectl get hpa payments-api-hpa

# View events
kubectl get events --sort-by='.lastTimestamp' | grep payments-api
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs payments-api
# or
kubectl logs -l app=payments-api
```

Common issues:
- Database connection failed: Check DB credentials and network connectivity
- Missing environment variables: Ensure all required variables are set
- Port already in use: Change the PORT environment variable

### Database connection errors

- Verify database is running and accessible
- Check firewall rules and security groups
- Verify credentials are correct
- Ensure database exists and schema is initialized

### Health check failures

- Check if the application started successfully
- Verify database connectivity
- Check resource limits (CPU/memory)

## Scaling

### Docker Compose

To scale the API service:

```bash
docker-compose -f docker-compose.payments.yml up -d --scale payments-api=3
```

### Kubernetes

The HorizontalPodAutoscaler automatically scales based on CPU/memory usage (3-10 pods).

To manually scale:

```bash
kubectl scale deployment payments-api --replicas=5
```

## Backup and Recovery

### Database Backups

Regular backups are critical for payment data:

```bash
# Backup
mysqldump -h your-db-host -u your-db-user -p your-db-name > backup.sql

# Restore
mysql -h your-db-host -u your-db-user -p your-db-name < backup.sql
```

For production, use automated backup solutions (AWS RDS automated backups, etc.).

## Support

For issues or questions:
- Check logs for error messages
- Review the SECURITY_GUIDE.md for security best practices
- Review the SECURITY_REPORT.md for security verification results
- Check the API documentation in the routes files

## References

- Requirements: `.kiro/specs/payment-system-api/requirements.md`
- Design: `.kiro/specs/payment-system-api/design.md`
- Tasks: `.kiro/specs/payment-system-api/tasks.md`
- Security Guide: `payment/SECURITY_GUIDE.md`
- Security Report: `payment/SECURITY_REPORT.md`
