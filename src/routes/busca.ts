// Auth enforced at mount point in index.ts: requireAuth + requireAdmin

import { Router, type Request, type Response } from "express";
import { FiltrosSchema, executarBusca } from "../busca/filtros";
import { logger } from "../logger";

const router = Router();
const log = logger.child({ rota: "/busca" });

router.get("/", async (req: Request, res: Response) => {
  const parse = FiltrosSchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ erro: "Filtros inválidos.", detalhes: parse.error.flatten().fieldErrors });
  }

  const filtros = parse.data;
  log.info({ filtros }, "busca iniciada");

  try {
    const resultado = await executarBusca(filtros);
    log.info({ total: resultado.total, pagina: resultado.pagina }, "busca concluída");
    return res.json(resultado);
  } catch (err: any) {
    log.error({ err: err.message }, "erro na busca");
    return res.status(500).json({ erro: "Erro interno ao realizar busca." });
  }
});

export default router;
