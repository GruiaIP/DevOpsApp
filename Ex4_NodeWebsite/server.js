const express = require("express");
const path = require("path");
const redis = require("redis");

const app = express();
const PORT = 3000;

// Create Redis client
const redisClient = redis.createClient({
    url: "redis://redis:6379"
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

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});