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

function uniqueResources(result, mapper) {
    if (!Array.isArray(result)) {
        return [];
    }

    const unique = new Map();

    for (const item of result) {
        const resource = mapper(
            item?.metric || {},
            item?.value || []
        );

        if (!resource || !resource.key) {
            continue;
        }

        unique.set(resource.key, resource.value);
    }

    return [...unique.values()];
}

function requireAllowedDetailType(type) {
    const allowedTypes = new Set([
        "namespaces",
        "services",
        "deployments",
        "pods",
        "nodes",
        "status",
    ]);

    return allowedTypes.has(type);
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

app.get("/api/cluster-details", async (req, res) => {
    const type =
        typeof req.query.type === "string"
            ? req.query.type.trim().toLowerCase()
            : "";

    if (!requireAllowedDetailType(type)) {
        return res.status(400).json({
            error: "Unsupported cluster detail type",
        });
    }

    try {
        if (type === "namespaces") {
            const result = await queryPrometheus(`
                kube_namespace_created
            `);

            const items = uniqueResources(
                result,
                (metric, value) => {
                    const name = metric.namespace;

                    if (!name) {
                        return null;
                    }

                    return {
                        key: name,
                        value: {
                            name,
                            createdAt: value[1]
                                ? new Date(
                                      Number(value[1]) * 1000
                                  ).toISOString()
                                : null,
                        },
                    };
                }
            ).sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            return res.json({
                type,
                title: "Kubernetes Namespaces",
                count: items.length,
                items,
                updatedAt: new Date().toISOString(),
            });
        }

        if (type === "services") {
            const result = await queryPrometheus(`
                kube_service_info
            `);

            const items = uniqueResources(
                result,
                (metric) => {
                    const namespace = metric.namespace;
                    const name = metric.service;

                    if (!namespace || !name) {
                        return null;
                    }

                    return {
                        key: `${namespace}/${name}`,
                        value: {
                            namespace,
                            name,
                            clusterIp:
                                metric.cluster_ip ||
                                "Not available",
                        },
                    };
                }
            ).sort((a, b) =>
                `${a.namespace}/${a.name}`.localeCompare(
                    `${b.namespace}/${b.name}`
                )
            );

            return res.json({
                type,
                title: "Kubernetes Services",
                count: items.length,
                items,
                updatedAt: new Date().toISOString(),
            });
        }

        if (type === "deployments") {
            const result = await queryPrometheus(`
                kube_deployment_created
            `);

            const items = uniqueResources(
                result,
                (metric, value) => {
                    const namespace = metric.namespace;
                    const name = metric.deployment;

                    if (!namespace || !name) {
                        return null;
                    }

                    return {
                        key: `${namespace}/${name}`,
                        value: {
                            namespace,
                            name,
                            createdAt: value[1]
                                ? new Date(
                                      Number(value[1]) * 1000
                                  ).toISOString()
                                : null,
                        },
                    };
                }
            ).sort((a, b) =>
                `${a.namespace}/${a.name}`.localeCompare(
                    `${b.namespace}/${b.name}`
                )
            );

            return res.json({
                type,
                title: "Kubernetes Deployments",
                count: items.length,
                items,
                updatedAt: new Date().toISOString(),
            });
        }

        if (type === "pods") {
            const [readyResult, nodeResult] =
                await Promise.all([
                    queryPrometheus(`
                        kube_pod_status_ready{
                            condition="true"
                        } == 1
                    `),

                    queryPrometheus(`
                        kube_pod_info
                    `),
                ]);

            const podNodes = new Map();

            for (const item of nodeResult) {
                const metric = item?.metric || {};

                if (
                    metric.namespace &&
                    metric.pod
                ) {
                    podNodes.set(
                        `${metric.namespace}/${metric.pod}`,
                        metric.node || "Unscheduled"
                    );
                }
            }

            const items = uniqueResources(
                readyResult,
                (metric) => {
                    const namespace = metric.namespace;
                    const name = metric.pod;

                    if (!namespace || !name) {
                        return null;
                    }

                    const key = `${namespace}/${name}`;

                    return {
                        key,
                        value: {
                            namespace,
                            name,
                            status: "Ready",
                            node:
                                podNodes.get(key) ||
                                "Unknown",
                        },
                    };
                }
            ).sort((a, b) =>
                `${a.namespace}/${a.name}`.localeCompare(
                    `${b.namespace}/${b.name}`
                )
            );

            return res.json({
                type,
                title: "Healthy Kubernetes Pods",
                count: items.length,
                items,
                updatedAt: new Date().toISOString(),
            });
        }

        if (type === "nodes") {
            const [nodeInfoResult, readyResult] =
                await Promise.all([
                    queryPrometheus(`
                        kube_node_info
                    `),

                    queryPrometheus(`
                        kube_node_status_condition{
                            condition="Ready",
                            status="true"
                        } == 1
                    `),
                ]);

            const readyNodes = new Set(
                readyResult
                    .map(
                        (item) =>
                            item?.metric?.node
                    )
                    .filter(Boolean)
            );

            const items = uniqueResources(
                nodeInfoResult,
                (metric) => {
                    const name = metric.node;

                    if (!name) {
                        return null;
                    }

                    return {
                        key: name,
                        value: {
                            name,
                            status: readyNodes.has(name)
                                ? "Ready"
                                : "Not Ready",
                            kernelVersion:
                                metric.kernel_version ||
                                "Unknown",
                            operatingSystem:
                                metric.os_image ||
                                metric.operating_system ||
                                "Unknown",
                            containerRuntime:
                                metric.container_runtime_version ||
                                "Unknown",
                            kubeletVersion:
                                metric.kubelet_version ||
                                "Unknown",
                        },
                    };
                }
            ).sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            return res.json({
                type,
                title: "Kubernetes Nodes",
                count: items.length,
                items,
                updatedAt: new Date().toISOString(),
            });
        }

        if (type === "status") {
            const [
                readyNodesResult,
                totalNodesResult,
                healthyPodsResult,
                activePodsResult,
            ] = await Promise.all([
                queryPrometheus(`
                    count(
                        kube_node_status_condition{
                            condition="Ready",
                            status="true"
                        }
                    )
                `),

                queryPrometheus(`
                    count(kube_node_info)
                `),

                queryPrometheus(`
                    count(
                        kube_pod_status_ready{
                            condition="true"
                        } == 1
                    )
                `),

                queryPrometheus(`
                    count(
                        kube_pod_status_phase{
                            phase=~"Pending|Running|Unknown"
                        } == 1
                    )
                `),
            ]);

            const readyNodes = Math.round(
                firstValue(readyNodesResult)
            );

            const totalNodes = Math.round(
                firstValue(totalNodesResult)
            );

            const healthyPods = Math.round(
                firstValue(healthyPodsResult)
            );

            const activePods = Math.round(
                firstValue(activePodsResult)
            );

            const healthy =
                totalNodes > 0 &&
                readyNodes === totalNodes &&
                activePods > 0 &&
                healthyPods === activePods;

            return res.json({
                type,
                title: "Cluster Health Summary",
                count: 4,
                status: healthy
                    ? "Healthy"
                    : "Degraded",

                items: [
                    {
                        label: "Ready Nodes",
                        value:
                            `${readyNodes}/${totalNodes}`,
                    },
                    {
                        label: "Healthy Pods",
                        value:
                            `${healthyPods}/${activePods}`,
                    },
                    {
                        label: "Node Availability",
                        value:
                            readyNodes === totalNodes
                                ? "All nodes ready"
                                : "Node attention required",
                    },
                    {
                        label: "Pod Availability",
                        value:
                            healthyPods === activePods
                                ? "All active Pods ready"
                                : "Pod attention required",
                    },
                ],

                updatedAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        console.error(
            `Unable to retrieve ${type} details:`,
            error
        );

        return res.status(503).json({
            error:
                "Cluster details are temporarily unavailable",
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