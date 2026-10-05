require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { supabase, supabaseUrl } = require("./supabase");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.get("/health/supabase", async (req, res) => {
    try {
        // Anonymous callers can't read any POS table, so check the Auth service instead.
        const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
            headers: { apikey: process.env.SUPABASE_ANON_KEY },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return res.status(503).json({
                status: "error",
                message: `Supabase REST API returned HTTP ${response.status}`,
            });
        }

        return res.json({ status: "ok", message: "Supabase connection is healthy" });
    } catch (error) {
        console.error("Supabase health check failed:", error.message);
        return res.status(503).json({
            status: "error",
            message: "Could not connect to Supabase",
        });
    }
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "POS backend is running",
        supabaseConfigured: Boolean(supabase),
    });
});

// Express 5 forwards rejected promises from async handlers here.
app.use((error, req, res, next) => {
    console.error(`${req.method} ${req.path} failed:`, error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Backend running on port ${port}`);
});