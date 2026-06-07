import "dotenv/config";
import express from "express";
import extintoresRouter from "./routes/extintores";
import inspecoesRouter from "./routes/inspecoes";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/extintores", extintoresRouter);
app.use("/inspecoes", inspecoesRouter);

app.listen(PORT, () => {
  console.log(`Server starting... listening on port ${PORT}`);
});
