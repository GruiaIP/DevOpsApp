async function loadCounter() {

    try {

        const response = await fetch("/counter");

        const data = await response.json();

        document.getElementById("visitor-count").textContent = data.visits;

    } catch (error) {

        document.getElementById("visitor-count").textContent = "Unavailable";

        console.error(error);

    }

}

loadCounter();