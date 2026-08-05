function createVisitorId() {
    if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
    ) {
        return window.crypto.randomUUID();
    }

    return [
        Date.now().toString(36),
        Math.random().toString(36).substring(2),
    ].join("-");
}

function getVisitorId() {
    const storageKey = "devops-portfolio-visitor-id";

    let visitorId = localStorage.getItem(storageKey);

    if (!visitorId) {
        visitorId = createVisitorId();
        localStorage.setItem(storageKey, visitorId);
    }

    return visitorId;
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

async function registerVisit() {
    try {
        const response = await fetch("/api/visit", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                visitorId: getVisitorId(),
            }),
        });

        if (!response.ok) {
            throw new Error(
                `Visit registration failed: ${response.status}`
            );
        }
    } catch (error) {
        console.error("Unable to register visit:", error);
    }
}

function formatRelativeTime(dateValue) {
    if (!dateValue) {
        return "Unavailable";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Unavailable";
    }

    const seconds = Math.floor(
        (Date.now() - date.getTime()) / 1000
    );

    if (seconds < 60) {
        return "Just now";
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days = Math.floor(hours / 24);

    return `${days} day${days === 1 ? "" : "s"} ago`;
}

async function loadApplicationOverview() {
    try {
        const response = await fetch("/api/overview", {
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(
                `Overview request failed: ${response.status}`
            );
        }

        const overview = await response.json();

        setText("application-status", "🟢 Running");
        setText("environment", overview.environment);
        setText("visitor-count", overview.visitors);
        setText("page-view-count", overview.pageViews);
        setText("current-version", overview.version);
        setText(
            "last-deployment",
            formatRelativeTime(overview.deployedAt)
        );
        setText("redis-status", overview.redis);
        setText(
            "deployment-message",
            overview.commitMessage || "Unavailable"
        );

        const commitLink =
            document.getElementById("deployment-commit");

        if (commitLink) {
            const shortCommit =
                overview.commit &&
                !["local", "unavailable"].includes(
                    overview.commit
                )
                    ? overview.commit.substring(0, 7)
                    : overview.commit || "Unavailable";

            commitLink.textContent = shortCommit;

            if (overview.commitUrl) {
                commitLink.href = overview.commitUrl;
                commitLink.classList.remove("disabled");
            } else {
                commitLink.removeAttribute("href");
                commitLink.classList.add("disabled");
            }
        }
    } catch (error) {
        console.error(
            "Unable to load application overview:",
            error
        );

        setText("application-status", "Unavailable");
        setText("redis-status", "Unavailable");
    }
}

function formatDuration(totalSeconds) {
    const seconds = Number(totalSeconds);

    if (!Number.isFinite(seconds) || seconds < 0) {
        return "Unavailable";
    }

    const days = Math.floor(seconds / 86400);

    if (days >= 1) {
        const hours = Math.floor(
            (seconds % 86400) / 3600
        );

        return `${days}d ${hours}h`;
    }

    const hours = Math.floor(seconds / 3600);

    if (hours >= 1) {
        const minutes = Math.floor(
            (seconds % 3600) / 60
        );

        return `${hours}h ${minutes}m`;
    }

    const minutes = Math.floor(seconds / 60);

    return `${minutes}m`;
}

async function loadClusterStats() {
    const status = document.getElementById(
        "cluster-health-status"
    );

    if (!status) {
        return;
    }

    try {
        const response = await fetch(
            "/api/cluster-stats",
            {
                cache: "no-store",
            }
        );

        if (!response.ok) {
            throw new Error(
                `Statistics request failed: ${response.status}`
            );
        }

        const stats = await response.json();

        setText(
            "namespace-count",
            stats.namespaces
        );

        setText(
            "service-count",
            stats.services
        );

        setText(
            "cluster-age",
            formatDuration(stats.clusterAgeSeconds)
        );

        setText(
            "deployment-count",
            stats.deployments
        );

        setText(
            "healthy-pods",
            `${stats.healthyPods}/${stats.activePods}`
        );

        setText(
            "cluster-status-value",
            stats.clusterStatus
        );

        setText(
            "cluster-stats-updated",
            `Last updated: ${new Date(
                stats.updatedAt
            ).toLocaleTimeString()}`
        );

        const healthy =
            stats.clusterStatus === "Healthy";

        status.textContent = healthy
            ? "Healthy"
            : "Degraded";

        status.className = healthy
            ? "health-status healthy"
            : "health-status unavailable";

        const statusValue =
            document.getElementById(
                "cluster-status-value"
            );

        if (statusValue) {
            statusValue.classList.toggle(
                "metric-healthy",
                healthy
            );

            statusValue.classList.toggle(
                "metric-degraded",
                !healthy
            );
        }
    } catch (error) {
        console.error(
            "Unable to load cluster statistics:",
            error
        );

        status.textContent = "Unavailable";
        status.className =
            "health-status unavailable";

        setText(
            "cluster-stats-updated",
            "Monitoring statistics are temporarily unavailable."
        );
    }
}

async function initializePage() {
	initializeClusterDetails();
    const hasApplicationOverview =
        document.getElementById(
            "application-status"
        );

    const hasClusterHealth =
        document.getElementById(
            "cluster-health-status"
        );

    if (hasApplicationOverview) {
        await registerVisit();

        await loadApplicationOverview();

        setInterval(
            loadApplicationOverview,
            5000
        );
    }

    if (hasClusterHealth) {
        await loadClusterStats();

        setInterval(
            loadClusterStats,
            30000
        );
    }
}

let lastFocusedClusterCard = null;

function formatOptionalDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toLocaleString();
}

function createDetailField(label, value) {
    if (!value) {
        return null;
    }

    const field =
        document.createElement("div");

    field.className =
        "cluster-resource-field";

    const fieldLabel =
        document.createElement("span");

    fieldLabel.textContent = label;

    const fieldValue =
        document.createElement("strong");

    fieldValue.textContent = value;

    field.append(fieldLabel, fieldValue);

    return field;
}

function createClusterResourceItem(type, item) {
    const resource =
        document.createElement("article");

    resource.className =
        "cluster-resource-item";

    const icon =
        document.createElement("span");

    icon.className =
        "cluster-resource-icon";

    const iconMap = {
        namespaces: "🗂️",
        services: "🔌",
        deployments: "🚀",
        pods: "📦",
        nodes: "🖥️",
        status: "🛡️",
    };

    icon.textContent =
        iconMap[type] || "☸";

    const content =
        document.createElement("div");

    content.className =
        "cluster-resource-content";

    if (type === "status") {
        const label =
            document.createElement("span");

        label.className =
            "cluster-resource-namespace";

        label.textContent = item.label;

        const value =
            document.createElement("h3");

        value.textContent = item.value;

        content.append(label, value);
        resource.append(icon, content);

        return resource;
    }

    const namespace =
        document.createElement("span");

    namespace.className =
        "cluster-resource-namespace";

    namespace.textContent =
        item.namespace ||
        type.slice(0, -1) ||
        "Kubernetes";

    const name =
        document.createElement("h3");

    name.textContent =
        item.name || "Unknown resource";

    content.append(namespace, name);

    const metadata =
        document.createElement("div");

    metadata.className =
        "cluster-resource-metadata";

    const fields = [
        createDetailField(
            "Status",
            item.status
        ),

        createDetailField(
            "Node",
            item.node
        ),

        createDetailField(
            "Cluster IP",
            item.clusterIp
        ),

        createDetailField(
            "Created",
            formatOptionalDate(
                item.createdAt
            )
        ),

        createDetailField(
            "Kubelet",
            item.kubeletVersion
        ),

        createDetailField(
            "Runtime",
            item.containerRuntime
        ),

        createDetailField(
            "Operating System",
            item.operatingSystem
        ),
    ].filter(Boolean);

    if (fields.length > 0) {
        metadata.append(...fields);
        content.appendChild(metadata);
    }

    resource.append(icon, content);

    return resource;
}

function renderClusterDetails(data) {
    const title =
        document.getElementById(
            "cluster-details-title"
        );

    const summary =
        document.getElementById(
            "cluster-details-summary"
        );

    const list =
        document.getElementById(
            "cluster-details-list"
        );

    const updated =
        document.getElementById(
            "cluster-details-updated"
        );

    if (!title || !summary || !list) {
        return;
    }

    title.textContent =
        data.title || "Cluster Details";

    summary.textContent =
        data.type === "status"
            ? `Current status: ${
                  data.status || "Unknown"
              }`
            : `${data.count || 0} resources found`;

    list.replaceChildren();

    const items = Array.isArray(data.items)
        ? data.items
        : [];

    if (items.length === 0) {
        const empty =
            document.createElement("p");

        empty.className =
            "cluster-details-empty";

        empty.textContent =
            "No resources were returned.";

        list.appendChild(empty);
    } else {
        const fragment =
            document.createDocumentFragment();

        for (const item of items) {
            fragment.appendChild(
                createClusterResourceItem(
                    data.type,
                    item
                )
            );
        }

        list.appendChild(fragment);
    }

    if (updated) {
        updated.textContent = data.updatedAt
            ? `Updated ${new Date(
                  data.updatedAt
              ).toLocaleTimeString()}`
            : "";
    }
}

async function loadClusterDetails(type) {
    const loading =
        document.getElementById(
            "cluster-details-loading"
        );

    const error =
        document.getElementById(
            "cluster-details-error"
        );

    const list =
        document.getElementById(
            "cluster-details-list"
        );

    if (loading) {
        loading.hidden = false;
    }

    if (error) {
        error.hidden = true;
    }

    if (list) {
        list.replaceChildren();
    }

    try {
        const response = await fetch(
            `/api/cluster-details?type=${
                encodeURIComponent(type)
            }`,
            {
                cache: "no-store",
            }
        );

        if (!response.ok) {
            throw new Error(
                `Cluster details request failed: ${
                    response.status
                }`
            );
        }

        const data = await response.json();

        renderClusterDetails(data);
    } catch (requestError) {
        console.error(
            "Unable to load cluster details:",
            requestError
        );

        if (error) {
            error.hidden = false;
        }
    } finally {
        if (loading) {
            loading.hidden = true;
        }
    }
}

function openClusterDetails(type, trigger) {
    const panel =
        document.getElementById(
            "cluster-details-panel"
        );

    const overlay =
        document.getElementById(
            "cluster-details-overlay"
        );

    const closeButton =
        document.getElementById(
            "cluster-details-close"
        );

    if (!panel || !overlay) {
        return;
    }

    lastFocusedClusterCard = trigger;

    overlay.hidden = false;

    requestAnimationFrame(() => {
        overlay.classList.add("visible");
        panel.classList.add("open");
    });

    panel.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "cluster-panel-open"
    );

    loadClusterDetails(type);

    if (closeButton) {
        closeButton.focus();
    }
}

function closeClusterDetails() {
    const panel =
        document.getElementById(
            "cluster-details-panel"
        );

    const overlay =
        document.getElementById(
            "cluster-details-overlay"
        );

    if (!panel || !overlay) {
        return;
    }

    panel.classList.remove("open");
    overlay.classList.remove("visible");

    panel.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "cluster-panel-open"
    );

    window.setTimeout(() => {
        overlay.hidden = true;
    }, 250);

    if (lastFocusedClusterCard) {
        lastFocusedClusterCard.focus();
    }
}

function initializeClusterDetails() {
    const triggers =
        document.querySelectorAll(
            "[data-cluster-detail]"
        );

    if (triggers.length === 0) {
        return;
    }

    triggers.forEach((trigger) => {
        trigger.addEventListener(
            "click",
            () => {
                openClusterDetails(
                    trigger.dataset.clusterDetail,
                    trigger
                );
            }
        );

        trigger.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();

                    openClusterDetails(
                        trigger.dataset.clusterDetail,
                        trigger
                    );
                }
            }
        );
    });

    document
        .getElementById(
            "cluster-details-close"
        )
        ?.addEventListener(
            "click",
            closeClusterDetails
        );

    document
        .getElementById(
            "cluster-details-overlay"
        )
        ?.addEventListener(
            "click",
            closeClusterDetails
        );

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                closeClusterDetails();
            }
        }
    );
}

initializePage();