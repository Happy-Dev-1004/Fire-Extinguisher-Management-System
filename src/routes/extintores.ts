import { Router, Request, Response } from "express";
import { supabase } from "../db";

const router = Router();

// GET /extintores — list all, optionally filter by unidade
router.get("/", async (req: Request, res: Response) => {
  let query = supabase.from("extintores").select("*").order("unidade").order("numero");

  if (req.query.unidade) {
    query = query.eq("unidade", req.query.unidade as string);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// GET /extintores/:id — get one by id
router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("extintores")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Extintor not found" });
  return res.json(data);
});

// POST /extintores — create a new extinguisher
router.post("/", async (req: Request, res: Response) => {
  const { numero, unidade, setor, tipo_carga, capacidade, vencimento_carga, vencimento_teste } = req.body;

  if (!numero || !unidade || !setor || !tipo_carga) {
    return res.status(400).json({ error: "numero, unidade, setor and tipo_carga are required" });
  }

  const { data, error } = await supabase
    .from("extintores")
    .insert({ numero, unidade, setor, tipo_carga, capacidade, vencimento_carga, vencimento_teste })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// PUT /extintores/:id — update an extinguisher
router.put("/:id", async (req: Request, res: Response) => {
  const { numero, unidade, setor, tipo_carga, capacidade, vencimento_carga, vencimento_teste } = req.body;

  const { data, error } = await supabase
    .from("extintores")
    .update({ numero, unidade, setor, tipo_carga, capacidade, vencimento_carga, vencimento_teste })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// DELETE /extintores/:id — delete an extinguisher (and its inspections via CASCADE)
router.delete("/:id", async (req: Request, res: Response) => {
  const { error } = await supabase
    .from("extintores")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(204).send();
});

export default router;
