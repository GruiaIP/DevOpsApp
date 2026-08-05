const express = require("express");
const path = require("path");
const os = require("os");
const redis = require("redis");

const app = express();

const PORT = process.env.PORT || 3000;

const PROMETHEUS_URL =
    process.env.PROMETHEUS_URL ||
    "http://monitoring-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090";

const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 365;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Redis client
const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
});

redisClient.on("error", (error) => {
    console.error("❌ Redis client error:", error);
});

function safeNumber(value, fallback = 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
}

async function saveDeploymentMetadata() {
    const version = process.env.APP_VERSION || "development";
    const commit = process.env.GIT_COMMIT || "local";
    const commitMessage =
        process.env.GIT_MESSAGE || "Local development";
    const deployedAt =
        process.env.DEPLOYED_AT || new Date().toISOString();

    await redisClient.hSet("deployment:current", {
        version,
        commit,
        commitMessage,
        deployedAt,
    });
}

// ------------------------------------------------------------------
// Health and application information
// ------------------------------------------------------------------

app.get("/health", async (req, res) => {
    let redisStatus = "Disconnected";

    try {
        if (redisClient.isReady) {
            await redisClient.ping();
            redisStatus = "Connected";
        }
    } catch (error) {
        redisStatus = "Unavailable";
    }

    const healthy = redisStatus === "Connected";

    res.status(healthy ? 200 : 503).json({
        status: healthy ? "OK" : "DEGRADED",
        uptime: process.uptime(),
        redis: redisStatus,
    });
});

app.get("/info", (req, res) => {
    res.json({
        app: process.env.APP_NAME || "node-app",
        hostname: os.hostname(),
        uptime: process.uptime(),
        pid: process.pid,
        redisConfigured: Boolean(process.env.REDIS_URL),
        port: PORT,
        version: process.env.APP_VERSION || "development",
        commit: process.env.GIT_COMMIT || "local",
    });
});

// ------------------------------------------------------------------
// Prometheus integration
// ------------------------------------------------------------------

async function queryPrometheus(query) {
    const url = new URL("/api/v1/query", PROMETHEUS_URL);

    url.searchParams.set("query", query);

    const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
        throw new Error(
            `Prometheus returned HTTP ${response.status}`
        );
    }

    const body = await response.json();

    if (body.status !== "success") {
        throw new Error(
            body.error || "Prometheus query failed"
        );
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
            namespaceResult,
            servicesResult,
            clusterAgeResult,
            deploymentsResult,
            healthyPodsResult,
            activePodsResult,
            readyNodesResult,
            totalNodesResult,
        ] = await Promise.all([
            // Number of Kubernetes namespaces
            queryPrometheus(`
                count(kube_namespace_created)
            `),

            // Number of Kubernetes Services
            queryPrometheus(`
                count(kube_service_info)
            `),

            // Seconds since the oldest Kubernetes node was created
            queryPrometheus(`
                time() - min(kube_node_created)
            `),

            // Number of Kubernetes Deployments
            queryPrometheus(`
                count(kube_deployment_created)
            `),

            // Pods currently reporting Ready=true
            queryPrometheus(`
                count(
                    kube_pod_status_ready{
                        condition="true"
                    } == 1
                )
            `),

            // Active Pods: Pending, Running, or Unknown
            queryPrometheus(`
                count(
                    kube_pod_status_phase{
                        phase=~"Pending|Running|Unknown"
                    } == 1
                )
            `),

            // Ready Kubernetes nodes
            queryPrometheus(`
                count(
                    kube_node_status_condition{
                        condition="Ready",
                        status="true"
                    }
                )
            `),

            // Total Kubernetes nodes
            queryPrometheus(`
                count(kube_node_info)
            `),
        ]);

        const namespaces = Math.round(
            firstValue(namespaceResult)
        );

        const services = Math.round(
            firstValue(servicesResult)
        );

        const clusterAgeSeconds = Math.round(
            firstValue(clusterAgeResult)
        );

        const deployments = Math.round(
            firstValue(deploymentsResult)
        );

        const healthyPods = Math.round(
            firstValue(healthyPodsResult)
        );

        const activePods = Math.round(
            firstValue(activePodsResult)
        );

        const readyNodes = Math.round(
            firstValue(readyNodesResult)
        );

        const totalNodes = Math.round(
            firstValue(totalNodesResult)
        );

        const clusterHealthy =
            totalNodes > 0 &&
            readyNodes === totalNodes &&
            activePods > 0 &&
            healthyPods === activePods;

        res.json({
            namespaces,
            services,
            clusterAgeSeconds,
            deployments,
            healthyPods,
            activePods,
            readyNodes,
            totalNodes,

            clusterStatus: clusterHealthy
                ? "Healthy"
                : "Degraded",

            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error(
            "Unable to retrieve cluster statistics:",
            error
        );

        res.status(503).json({
            error:
                "Monitoring data is temporarily unavailable",
        });
    }
});

// ------------------------------------------------------------------
// Visitor statistics
// ------------------------------------------------------------------

app.post("/api/visit", async (req, res) => {
    try {
        const visitorId =
            typeof req.body?.visitorId === "string"
                ? req.body.visitorId.trim()
                : "";

        if (!visitorId || visitorId.length > 100) {
            return res.status(400).json({
                error: "A valid visitor ID is required",
            });
        }

        const visitorKey = `visitor:${visitorId}`;

        const newVisitor = await redisClient.set(
            visitorKey,
            "1",
            {
                NX: true,
                EX: VISITOR_TTL_SECONDS,
            }
        );

        if (newVisitor === "OK") {
            await redisClient.incr("stats:visitors");
        }

        const pageViews = await redisClient.incr(
            "stats:page_views"
        );

        const visitors = await redisClient.get(
            "stats:visitors"
        );

        return res.json({
            uniqueVisitor: newVisitor === "OK",
            visitors: safeNumber(visitors),
            pageViews: safeNumber(pageViews),
        });
    } catch (error) {
        console.error(
            "Failed to register visit:",
            error
        );

        return res.status(503).json({
            error:
                "Visitor statistics are temporarily unavailable",
        });
    }
});

// ------------------------------------------------------------------
// Application overview
// ------------------------------------------------------------------

app.get("/api/overview", async (req, res) => {
    try {
        const [visitors, pageViews, deployment] =
            await Promise.all([
                redisClient.get("stats:visitors"),
                redisClient.get("stats:page_views"),
                redisClient.hGetAll(
                    "deployment:current"
                ),
            ]);

        const commit =
            deployment.commit || "unavailable";

        const commitUrl =
            commit !== "local" &&
            commit !== "unavailable"
                ? `https://github.com/GruiaIP/DevOpsApp/commit/${commit}`
                : null;

        return res.json({
            application: "Running",
            environment:
                process.env.NODE_ENV || "production",

            hostname: os.hostname(),
            redis: redisClient.isReady
                ? "Connected"
                : "Disconnected",

            visitors: safeNumber(visitors),
            pageViews: safeNumber(pageViews),

            version:
                deployment.version ||
                process.env.APP_VERSION ||
                "unavailable",

            deployedAt:
                deployment.deployedAt ||
                process.env.DEPLOYED_AT ||
                null,

            commit,

            commitMessage:
                deployment.commitMessage ||
                process.env.GIT_MESSAGE ||
                "Unavailable",

            commitUrl,
        });
    } catch (error) {
        console.error(
            "Failed to retrieve application overview:",
            error
        );

        return res.status(503).json({
            error:
                "Application overview is temporarily unavailable",
        });
    }
});

// ------------------------------------------------------------------
// Application startup
// ------------------------------------------------------------------

async function startServer() {
    try {
        await redisClient.connect();

        console.log("✅ Connected to Redis");

        await saveDeploymentMetadata();

        console.log(
            "✅ Deployment metadata saved in Redis"
        );

        app.listen(PORT, () => {
            console.log(
                `🚀 Server running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            "❌ Application startup failed:",
            error
        );

        process.exit(1);
    }
}

async function shutdown(signal) {
    console.log(`${signal} received. Shutting down...`);

    try {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    } catch (error) {
        console.error(
            "Error while closing Redis:",
            error
        );
    }

    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();