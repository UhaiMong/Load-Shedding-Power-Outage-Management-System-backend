import express from "express";

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("App is running!");
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "OK",
    data: { uptime: process.uptime() },
  });
});
