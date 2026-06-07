import "dotenv/config";
import express from "express";
import { supabase } from "./db";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/db-test", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("extintores").select("*").limit(1);
    if (error) throw error;
    res.json({ status: "connected", data });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server starting... listening on port ${PORT}`);
});
