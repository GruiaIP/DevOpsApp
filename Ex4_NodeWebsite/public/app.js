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
            "cluster-cpu",
            `${stats.cpuPercent}%`
        );

        setText(
            "cluster-memory",
            `${stats.memoryPercent}%`
        );

        setText(
            "ready-nodes",
            stats.readyNodes
        );

        setText(
            "running-pods",
            stats.runningPods
        );

        setText(
            "available-replicas",
            `${stats.availableReplicas}/3`
        );

        setText(
            "prometheus-targets",
            stats.prometheusTargetsUp
        );

        setText(
            "cluster-stats-updated",
            `Last updated: ${new Date(
                stats.updatedAt
            ).toLocaleTimeString()}`
        );

        status.textContent = "Healthy";
        status.className =
            "health-status healthy";
    } catch (error) {
        console.error(error);

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

initializePage();