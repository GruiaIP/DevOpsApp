async function loadCounter() {

    try {

        const response = await fetch("/counter");

        const data = await response.json();

        document.getElementById("visitor-count").textContent = data.visits;

    }

    catch (err) {

        console.error(err);

    }

}

async function loadInfo() {

    try {

        const response = await fetch("/info");

        const info = await response.json();

        // Hostname
        document.getElementById("hostname").textContent = info.hostname;

        // Port
        document.getElementById("port").textContent = info.port;

        // Redis
        const redisStatus = info.redis ? "🟢 Connected" : "🔴 Disconnected";

        document.getElementById("redis-status").textContent = redisStatus;

        // Environment detection

        let environment = "Local";

        if (info.hostname.startsWith("node-app")) {

            environment = "☸ Kubernetes";

        }

        else if (
            info.hostname.includes("docker") ||
            info.hostname.length === 12
        ) {

            environment = "🐳 Docker";

        }

        else {

            environment = "💻 Local";

        }

        document.getElementById("environment").textContent = environment;

    }

    catch (err) {

        console.error(err);

    }

}

async function refresh() {

    await loadCounter();

    await loadInfo();

}

async function loadClusterStats() {
  const status = document.getElementById("cluster-health-status");

  try {
    const response = await fetch("/api/cluster-stats", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Statistics request failed: ${response.status}`);
    }

    const stats = await response.json();

    document.getElementById("cluster-cpu").textContent =
      `${stats.cpuPercent}%`;

    document.getElementById("cluster-memory").textContent =
      `${stats.memoryPercent}%`;

    document.getElementById("ready-nodes").textContent =
      stats.readyNodes;

    document.getElementById("running-pods").textContent =
      stats.runningPods;

    document.getElementById("available-replicas").textContent =
      `${stats.availableReplicas}/3`;

    document.getElementById("prometheus-targets").textContent =
      stats.prometheusTargetsUp;

    document.getElementById("cluster-stats-updated").textContent =
      `Last updated: ${new Date(stats.updatedAt).toLocaleTimeString()}`;

    status.textContent = "Healthy";
    status.className = "health-status healthy";
  } catch (error) {
    console.error(error);

    status.textContent = "Unavailable";
    status.className = "health-status unavailable";

    document.getElementById("cluster-stats-updated").textContent =
      "Monitoring statistics are temporarily unavailable.";
  }
}

loadClusterStats();
setInterval(loadClusterStats, 30000);

// Initial load
refresh();

// Refresh every 5 seconds
setInterval(refresh, 5000);