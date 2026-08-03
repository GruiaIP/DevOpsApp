const express = require("express");
const path = require("path");
const redis = require("redis");

const app = express();
const PORT = process.env.PORT || 3000;

// Create Redis client
const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

// Connect to Redis
(async () => {
    try {
        await redisClient.connect();
        console.log("✅ Connected to Redis");
    } catch (err) {
        console.error("❌ Failed to connect to Redis:", err);
    }
})();

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Counter endpoint
app.get("/counter", async (req, res) => {
    try {
        const visits = await redisClient.incr("visits");

        res.json({
            visits: visits
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Redis unavailable"
        });
    }
});

// Health endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime()
    });
});

// Pod information
app.get("/info", (req, res) => {
    res.json({
        app: process.env.APP_NAME,
        hostname: require("os").hostname(),
        uptime: process.uptime(),
        pid: process.pid,
        redis: process.env.REDIS_URL,
        port: process.env.PORT
    });
});

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  "http://monitoring-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090";

async function queryPrometheus(query) {
  const url = new URL("/api/v1/query", PROMETHEUS_URL);
  url.searchParams.set("query", query);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Prometheus returned HTTP ${response.status}`);
  }

  const body = await response.json();

  if (body.status !== "success") {
    throw new Error(body.error || "Prometheus query failed");
  }

  return body.data.result;
}

function firstValue(result, fallback = 0) {
  if (!Array.isArray(result) || result.length === 0) {
    return fallback;
  }

  const value = Number(result[0]?.value?.[1]);
  return Number.isFinite(value) ? value : fallback;
}

app.get("/api/cluster-stats", async (req, res) => {
  try {
    const [
      cpuResult,
      memoryResult,
      readyNodesResult,
      runningPodsResult,
      availableReplicasResult,
      prometheusTargetsResult,
    ] = await Promise.all([
      queryPrometheus(`
        100 - (
          avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100
        )
      `),

      queryPrometheus(`
        100 * (
          1 -
          sum(node_memory_MemAvailable_bytes)
          /
          sum(node_memory_MemTotal_bytes)
        )
      `),

      queryPrometheus(`
        count(
          kube_node_status_condition{
            condition="Ready",
            status="true"
          }
        )
      `),

      queryPrometheus(`
        count(
          kube_pod_status_phase{
            phase="Running"
          } == 1
        )
      `),

      queryPrometheus(`
        sum(
          kube_deployment_status_replicas_available{
            namespace="devops",
            deployment="node-app"
          }
        )
      `),

      queryPrometheus(`
        sum(up)
      `),
    ]);

    res.json({
      cpuPercent: Number(firstValue(cpuResult).toFixed(1)),
      memoryPercent: Number(firstValue(memoryResult).toFixed(1)),
      readyNodes: Math.round(firstValue(readyNodesResult)),
      runningPods: Math.round(firstValue(runningPodsResult)),
      availableReplicas: Math.round(firstValue(availableReplicasResult)),
      prometheusTargetsUp: Math.round(firstValue(prometheusTargetsResult)),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to retrieve cluster statistics:", error);

    res.status(503).json({
      error: "Monitoring data is temporarily unavailable",
    });
  }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});