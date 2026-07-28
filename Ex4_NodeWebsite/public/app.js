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

// Initial load
refresh();

// Refresh every 5 seconds
setInterval(refresh, 5000);