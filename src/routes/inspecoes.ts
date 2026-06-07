import { Router, Request, Response } from "express";
import { supabase } from "../db";

const router = Router();

// GET /inspecoes — list all, optionally filter by numero+unidade or mes_referencia
router.get("/", async (req: Request, res: Response) => {
  let query = supabase
    .from("inspecoes")
    .select("*")
    .order("data_inspecao", { ascending: false });

  if (req.query.extintor_numero) query = query.eq("extintor_numero", req.query.extintor_numero as string);
  if (req.query.extintor_unidade) query = query.eq("extintor_unidade", req.query.extintor_unidade as string);
  if (req.query.mes_referencia)   query = query.eq("mes_referencia", req.query.mes_referencia as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// GET /inspecoes/:id — get one inspection by id
router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("inspecoes")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Inspecao not found" });
  return res.json(data);
});

// POST /inspecoes — record a new inspection
router.post("/", async (req: Request, res: Response) => {
  const {
    extintor_numero, extintor_unidade, mes_referencia, data_inspecao, inspetor,
    lacre, vencimento_carga, vencimento_teste, manometro,
    sinalizacao_parede, sinalizacao_piso, suporte, mangueira, quadro_instrucao,
    status_geral, observacoes, fotos,
  } = req.body;

  if (!extintor_numero || !extintor_unidade || !mes_referencia || !data_inspecao || !inspetor) {
    return res.status(400).json({
      error: "extintor_numero, extintor_unidade, mes_referencia, data_inspecao and inspetor are required",
    });
  }

  const { data, error } = await supabase
    .from("inspecoes")
    .insert({
      extintor_numero, extintor_unidade, mes_referencia, data_inspecao, inspetor,
      lacre, vencimento_carga, vencimento_teste, manometro,
      sinalizacao_parede, sinalizacao_piso, suporte, mangueira, quadro_instrucao,
      status_geral, observacoes, fotos: fotos ?? [],
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

// PUT /inspecoes/:id — update an inspection
router.put("/:id", async (req: Request, res: Response) => {
  const {
    mes_referencia, data_inspecao, inspetor,
    lacre, vencimento_carga, vencimento_teste, manometro,
    sinalizacao_parede, sinalizacao_piso, suporte, mangueira, quadro_instrucao,
    status_geral, observacoes, fotos,
  } = req.body;

  const { data, error } = await supabase
    .from("inspecoes")
    .update({
      mes_referencia, data_inspecao, inspetor,
      lacre, vencimento_carga, vencimento_teste, manometro,
      sinalizacao_parede, sinalizacao_piso, suporte, mangueira, quadro_instrucao,
      status_geral, observacoes, fotos,
    })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

// DELETE /inspecoes/:id — delete one inspection
router.delete("/:id", async (req: Request, res: Response) => {
  const { error } = await supabase
    .from("inspecoes")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(204).send();
});

export default router;
