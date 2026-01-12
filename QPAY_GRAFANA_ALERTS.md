# QPay Grafana Dashboard & Prometheus Alerts

## Overview

This document describes how to set up Grafana dashboards and Prometheus alerts for monitoring the QPay payment integration across API Gateway and Order Service.

## Files

- **`dashboards/QPAY_OVERVIEW_GRAFANA.json`** - Grafana dashboard with 10 panels
- **`alerts/qpay-alerts.yml`** - Prometheus alert rules (5 core + 3 optional)

---

## Metrics Endpoints

Both services expose `/metrics` endpoints for Prometheus scraping:

- **API Gateway:** `http://api-gateway:8080/metrics` (or `http://localhost:8080/metrics`)
- **Order Service:** `http://order-service:6003/metrics` (or `http://localhost:6003/metrics`)

### Example Prometheus Scrape Config

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:8080']
    scrape_interval: 15s

  - job_name: 'order-service'
    static_configs:
      - targets: ['order-service:6003']
    scrape_interval: 15s
```

---

## Importing the Grafana Dashboard

### Option 1: Via Grafana UI

1. Navigate to **Dashboards** → **New** → **Import**
2. Click **Upload JSON file** and select `dashboards/QPAY_OVERVIEW_GRAFANA.json`
3. Select your Prometheus datasource when prompted
4. Click **Import**

### Option 2: Via Grafana API

```bash
GRAFANA_URL="http://localhost:3000"
GRAFANA_API_KEY="<your-api-key>"

curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboards/QPAY_OVERVIEW_GRAFANA.json
```

### Option 3: Via Grafana Provisioning

If using Grafana provisioning, place the JSON file in your provisioning directory:

```bash
cp dashboards/QPAY_OVERVIEW_GRAFANA.json /etc/grafana/provisioning/dashboards/
```

And ensure you have a provisioning config file:

```yaml
# /etc/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

---

## Loading Prometheus Alert Rules

### Option 1: Add to Existing Prometheus Config

Edit your `prometheus.yml` to include the alert rule file:

```yaml
rule_files:
  - 'alerts/qpay-alerts.yml'
  # ... other rule files ...
```

Then reload Prometheus:

```bash
# Send SIGHUP to reload config
kill -HUP $(pidof prometheus)

# Or if using systemd
systemctl reload prometheus

# Or restart
docker restart prometheus  # if using Docker
```

### Option 2: Mount as Volume (Docker/Kubernetes)

**Docker Compose:**
```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alerts:/etc/prometheus/alerts
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
```

**Kubernetes ConfigMap:**
```bash
kubectl create configmap qpay-alerts \
  --from-file=alerts/qpay-alerts.yml \
  -n monitoring
```

### Verify Alerts are Loaded

Visit the Prometheus UI:

1. Navigate to **Status** → **Rules**
2. Look for the `qpay` group
3. You should see 5-8 alert rules listed

Alternatively, check via API:

```bash
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="qpay")'
```

---

## Dashboard Panels

The dashboard includes 10 panels:

1. **Gateway RPS by Route** - Request rate per endpoint
2. **Gateway Error Rate %** - Percentage of failed gateway requests
3. **Gateway Upstream Status Breakdown** - HTTP status distribution
4. **Gateway P95 Latency by Route** - 95th percentile latency
5. **Webhook Outcomes** - Stacked view of all webhook outcomes
6. **Webhook Success Rate %** - Percentage creating orders
7. **Top Webhook Failure Outcomes** - Bar chart of non-success outcomes
8. **Payment Check Errors by HTTP Status** - QPay API error breakdown
9. **Payment Check P95 Latency** - QPay API response time
10. **DUPLICATE Share %** - Idempotency hit rate

---

## Alert Rules

### Core Alerts (5)

1. **QPayGatewayHighErrorRate** (Warning)
   - Triggers when gateway error rate > 5% for 5 minutes
   - Check API Gateway logs and order-service health

2. **QPayGatewayHighTimeoutRate** (Critical)
   - Triggers when timeout rate > 2% for 5 minutes
   - Check network, order-service latency, timeout settings

3. **QPayWebhookHighUnexpectedError** (Critical)
   - Triggers when webhook ERROR outcome > 2% for 5 minutes
   - Check order-service logs, DB/Redis connectivity

4. **QPayWebhookSessionMissingSpike** (Warning)
   - Triggers when SESSION_MISSING outcomes occur for 10 minutes
   - Check Redis TTL, DB persistence, webhook timing

5. **QPayPaymentCheckHighLatencyP95** (Warning)
   - Triggers when p95 latency > 2000ms for 10 minutes
   - Check QPay API status, token caching, network

### Optional Alerts (3)

6. **QPayWebhookSuccessRateLow** - Success rate < 80%
7. **QPayPaymentCheckHighErrorRate** - Payment check error rate > 10%
8. **QPayGatewayNoTraffic** - No traffic for 30 minutes (info-level)

---

## Quick Runbooks

### When Timeouts Spike

**Symptom:** `QPayGatewayHighTimeoutRate` alert fires

**What to Check:**
1. **Order-service health:** `curl http://order-service:6003/health` - Is it responding?
2. **Order-service metrics:** Check `qpay_webhook_outcome_duration_ms` p95 - Is webhook processing slow?
3. **Network latency:** `ping order-service` or check Kubernetes/Docker network
4. **Resource utilization:** CPU/memory of order-service pod/container
5. **Database connection pool:** Check if MongoDB/Redis connections are saturated
6. **Recent deployments:** Was order-service recently updated?

**Quick Fixes:**
- Increase gateway timeout if order-service is consistently slow but healthy
- Scale up order-service replicas if CPU-bound
- Restart order-service if unresponsive

---

### When SESSION_MISSING Occurs

**Symptom:** `QPayWebhookSessionMissingSpike` alert fires

**What to Check:**
1. **Redis persistence:** `redis-cli GET "payment-session:<sessionId>"` - Is session in Redis?
2. **Redis TTL:** Check `TTL "payment-session:<sessionId>"` - Did it expire too early?
3. **Database fallback:** Query `QPayPaymentSession` table - Is session in DB?
4. **Webhook timing:** Check webhook event timestamps vs session creation - Is QPay sending late webhooks?
5. **Recent Redis restarts:** Did Redis lose data?
6. **Seed-session errors:** Check logs for failed session creation

**Quick Fixes:**
- Increase Redis TTL in seed-session (currently 30 minutes)
- Verify DB persistence is enabled (`QPayPaymentSession.create()` succeeds)
- Check QPay webhook delivery logs for delays

---

### When Payment Check is Slow

**Symptom:** `QPayPaymentCheckHighLatencyP95` alert fires

**What to Check:**
1. **QPay API status:** Check QPay status page or support channel
2. **Token caching:** Verify `qpay-access-token` is cached in Redis (reduces auth overhead)
3. **Network latency:** `curl -w "@curl-format.txt" -o /dev/null -s https://merchant.qpay.mn/v2/payment/check`
4. **Request volume:** High QPay API load from reconciliation + status polling?
5. **Rate limiting:** Are we hitting QPay API rate limits?

**Quick Fixes:**
- Reduce status polling frequency if P95 > 2s consistently
- Verify token caching is working (should only auth once every ~1 hour)
- Contact QPay support if their API is degraded
- Implement request queue/backoff if hitting rate limits

---

## Testing the Setup

### 1. Generate Test Traffic

```bash
# Seed session
curl -X POST http://localhost:8080/payments/qpay/seed-session \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionData":{...},"userId":"test","totalAmount":100}'

# Check status
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/payments/qpay/status?sessionId=<sessionId>"

# Webhook
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=<sessionId>&token=<token>" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_test","status":"paid"}'
```

### 2. Check Metrics

```bash
# Gateway metrics
curl http://localhost:8080/metrics | grep qpay_gateway_request_total

# Order-service metrics
curl http://localhost:6003/metrics | grep qpay_webhook_outcome_total
curl http://localhost:6003/metrics | grep qpay_payment_check_total
```

### 3. Verify Dashboard

1. Open Grafana
2. Navigate to **QPay Overview** dashboard
3. Verify panels are populating with data
4. Check that time ranges match your test traffic

### 4. Test Alerts (Optional)

Simulate an alert condition:

```bash
# Stop order-service to trigger timeout alerts
docker stop order-service

# Make requests
for i in {1..10}; do
  curl -H "Authorization: Bearer <token>" \
    "http://localhost:8080/payments/qpay/status?sessionId=test$i" &
done

# Wait 5-10 minutes
# Check Prometheus Alerts page for QPayGatewayHighTimeoutRate

# Restart order-service
docker start order-service
```

---

## Troubleshooting

### Dashboard Shows "No Data"

**Possible Causes:**
1. Prometheus is not scraping the services
2. Metrics endpoints are not accessible
3. Wrong datasource selected in dashboard
4. Time range is too narrow

**Solutions:**
- Check Prometheus targets: `http://prometheus:9090/targets`
- Verify metrics exist: `curl http://localhost:8080/metrics | grep qpay`
- Ensure datasource is configured in Grafana
- Expand time range to last 1 hour

### Alerts Not Firing

**Possible Causes:**
1. Alert rules not loaded
2. Metrics have no data
3. Alert thresholds too high
4. AlertManager not configured

**Solutions:**
- Check Prometheus rules: `http://prometheus:9090/rules`
- Verify metrics have values: `http://prometheus:9090/graph`
- Temporarily lower thresholds to test
- Configure AlertManager for notifications

### Wrong Datasource in Dashboard

If the dashboard shows `${DS_PROMETHEUS}` instead of your datasource:

1. Edit dashboard
2. Click **Settings** (gear icon)
3. Go to **Variables**
4. Edit `DS_PROMETHEUS` variable
5. Set correct datasource
6. Save dashboard

---

## Additional Resources

- **Prometheus Query Examples:** See `QPAY_OBSERVABILITY.md`
- **Metric Definitions:** See `QPAY_PAYMENT_CHECK_METRICS.md`, `QPAY_WEBHOOK_OUTCOME_METRICS.md`, `QPAY_GATEWAY_METRICS.md`
- **Grafana Docs:** https://grafana.com/docs/grafana/latest/dashboards/
- **Prometheus Docs:** https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/

---

*Last Updated: January 7, 2026*  
*Version: 1.0*

