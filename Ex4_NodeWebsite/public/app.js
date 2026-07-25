async function loadCounter() {

    try {

        const response = await fetch("/counter");
        const data = await response.json();

        document.getElementById("visitor-count").textContent = data.visits;

    }

    catch (error) {

        console.error(error);

    }

}

async function loadInfo() {

    try {

        const response = await fetch("/info");

        const info = await response.json();

        document.getElementById("hostname").textContent = info.hostname;

        document.getElementById("port").textContent = info.port;

        document.getElementById("redis-status").textContent =
            info.redis ? "Connected" : "Disconnected";

        /* Detect environment */

        if (info.hostname.includes("node-app")) {

            document.getElementById("environment").textContent = "Kubernetes";

        }

        else if (info.hostname.includes("docker")) {

            document.getElementById("environment").textContent = "Docker";

        }

        else {

            document.getElementById("environment").textContent = "Local";

        }

    }

    catch(error){

        console.error(error);

    }

}

loadCounter();

loadInfo();