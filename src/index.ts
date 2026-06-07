import "dotenv/config";
import express from "express";
import extintoresRouter from "./routes/extintores";
import inspecoesRouter from "./routes/inspecoes";
import webhookRouter from "./routes/webhook";
import fichaRouter from "./routes/ficha";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/extintores", extintoresRouter);
app.use("/inspecoes", inspecoesRouter);
app.use("/webhook", webhookRouter);
app.use("/ficha", fichaRouter);

app.listen(PORT, () => {
  console.log(`Server starting... listening on port ${PORT}`);
});
