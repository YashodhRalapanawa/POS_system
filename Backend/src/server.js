require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "POS backend is running",
    });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Backend running on port ${port}`);
});