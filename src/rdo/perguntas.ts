// =============================================================================
// RDO question set — DATA/CONFIG ONLY (no engine logic here).
//
// The conversation engine (maquina.ts) walks this list in order, asking each
// `pergunta` and storing the validated answer at `destino`. To add, remove or
// reorder questions, edit THIS array — the engine never changes.
//
// `tipo` decides validation + how the answer is parsed:
//   texto    — free text (stored as-is)
//   numero   — must parse to an integer >= 0
//   data     — must parse to a date (accepts dd/mm/aaaa, "hoje", ISO)
//   sim_nao  — yes/no → boolean
//   opcao    — one of `opcoes`
//   fotos    — the photo step: engine asks, then collects photos until "pronto"
//
// `destino`:
//   { coluna }           — store at rdos.<coluna>
//   { jsonb, chave }     — store at rdos.<jsonb>->><chave>
// =============================================================================

export type TipoPergunta = "texto" | "numero" | "data" | "sim_nao" | "opcao" | "fotos";

export interface Destino {
  coluna?: string;            // a top-level column on rdos
  jsonb?: string;             // a jsonb column on rdos
  chave?: string;             // key inside that jsonb object
}

export interface Pergunta {
  key:        string;         // stable id
  pergunta:   string;         // pt-BR text shown to the supervisor
  tipo:       TipoPergunta;
  destino:    Destino;
  opcoes?:    { valor: string; rotulo: string }[]; // for tipo "opcao"
  obrigatoria?: boolean;      // if false, supervisor may answer "pular"
}

export const PERGUNTAS: Pergunta[] = [
  // ── 1. Identificação ────────────────────────────────────────────────────────
  { key: "data",        tipo: "data",  destino: { coluna: "data" },
    pergunta: "📋 Vamos iniciar o RDO de hoje.\n\nQual a *data* do relatório? (ex.: 18/06/2026 ou responda *hoje*)" },
  { key: "responsavel", tipo: "texto", destino: { coluna: "responsavel" },
    pergunta: "Qual o *nome do responsável* pelo relatório?" },
  { key: "periodo",     tipo: "opcao", destino: { coluna: "periodo" },
    opcoes: [{ valor: "diurno", rotulo: "Diurno" }, { valor: "noturno", rotulo: "Noturno" }],
    pergunta: "Qual o *período*?\n1️⃣ Diurno\n2️⃣ Noturno\n(responda 1 ou 2)" },
  { key: "clima",       tipo: "texto", destino: { coluna: "clima" },
    pergunta: "Como está o *clima* hoje? (ex.: Ensolarado, Chuvoso, Nublado)" },

  // ── 2. Localização / frente de trabalho ─────────────────────────────────────
  { key: "central",         tipo: "texto", destino: { coluna: "central" },
    pergunta: "Qual a *central* atendida hoje? (ex.: Central 3 - Fábrica)" },
  { key: "laco",            tipo: "texto", destino: { coluna: "laco" }, obrigatoria: false,
    pergunta: "Qual o *laço* trabalhado? (se não souber, responda *pular*)" },
  { key: "frente_trabalho", tipo: "texto", destino: { coluna: "frente_trabalho" },
    pergunta: "Qual a *frente de trabalho* / área? (ex.: Torrefação, Paletização)" },

  // ── 3. Efetivo em campo ─────────────────────────────────────────────────────
  { key: "ef_eletricistas", tipo: "numero", destino: { jsonb: "efetivo", chave: "eletricistas" },
    pergunta: "👷 *Efetivo em campo*\n\nQuantos *eletricistas* hoje?" },
  { key: "ef_ajudantes",    tipo: "numero", destino: { jsonb: "efetivo", chave: "ajudantes" },
    pergunta: "Quantos *ajudantes*?" },
  { key: "ef_tecnicos",     tipo: "numero", destino: { jsonb: "efetivo", chave: "tecnicos" },
    pergunta: "Quantos *técnicos*?" },
  { key: "ef_supervisores", tipo: "numero", destino: { jsonb: "efetivo", chave: "supervisores" },
    pergunta: "Quantos *supervisores/encarregados*?" },

  // ── 4. Atividades executadas ────────────────────────────────────────────────
  { key: "at_infra",       tipo: "texto", destino: { jsonb: "atividades", chave: "infraestrutura" }, obrigatoria: false,
    pergunta: "🔧 *Atividades do dia*\n\nO que foi feito de *infraestrutura* (eletrocalha, eletroduto)? (ou *pular*)" },
  { key: "at_cabeamento",  tipo: "texto", destino: { jsonb: "atividades", chave: "cabeamento" }, obrigatoria: false,
    pergunta: "O que foi feito de *cabeamento*? (ou *pular*)" },
  { key: "at_montagem",    tipo: "texto", destino: { jsonb: "atividades", chave: "montagem" }, obrigatoria: false,
    pergunta: "O que foi feito de *montagem/instalação de dispositivos*? (ou *pular*)" },
  { key: "at_programacao", tipo: "texto", destino: { jsonb: "atividades", chave: "programacao" }, obrigatoria: false,
    pergunta: "O que foi feito de *programação/endereçamento/testes*? (ou *pular*)" },

  // ── 5. Dispositivos instalados no dia ───────────────────────────────────────
  { key: "di_fumaca",   tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "detector_fumaca" },
    pergunta: "🧯 *Dispositivos instalados HOJE*\n\nQuantos *detectores de fumaça*?" },
  { key: "di_temp",     tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "detector_temperatura" },
    pergunta: "Quantos *detectores de temperatura*?" },
  { key: "di_linear",   tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "detector_linear" },
    pergunta: "Quantos *detectores lineares*?" },
  { key: "di_acionador",tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "acionador" },
    pergunta: "Quantos *acionadores manuais*?" },
  { key: "di_sirene",   tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "sirene" },
    pergunta: "Quantas *sirenes*?" },
  { key: "di_modulo",   tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "modulo_supervisao" },
    pergunta: "Quantos *módulos de supervisão*?" },
  { key: "di_isolador", tipo: "numero", destino: { jsonb: "dispositivos_instalados", chave: "isolador" },
    pergunta: "Quantos *isoladores*?" },

  // ── 6. Segurança / integração ───────────────────────────────────────────────
  { key: "pt_numero",        tipo: "texto",   destino: { coluna: "pt_numero" }, obrigatoria: false,
    pergunta: "🦺 *Segurança*\n\nQual o número da *PT (Permissão de Trabalho)*? (ou *pular*)" },
  { key: "integracao_novos", tipo: "sim_nao", destino: { coluna: "integracao_novos" },
    pergunta: "Houve *integração de novos colaboradores* hoje? (responda *sim* ou *não*)" },

  // ── 7. Ocorrências, atrasos e planejamento ──────────────────────────────────
  { key: "ocorrencias",     tipo: "texto", destino: { coluna: "ocorrencias" }, obrigatoria: false,
    pergunta: "⚠️ Houve alguma *ocorrência/intercorrência*? Descreva (ou *pular*)." },
  { key: "atrasos",         tipo: "texto", destino: { jsonb: "atrasos", chave: "descricao" }, obrigatoria: false,
    pergunta: "Houve *atrasos ou impedimentos*? Descreva o motivo (ou *pular*)." },
  { key: "planejamento",    tipo: "texto", destino: { coluna: "planejamento_proximo_dia" }, obrigatoria: false,
    pergunta: "📅 Qual o *planejamento para o próximo dia*? (ou *pular*)" },

  // ── 8. Registro fotográfico do dia ──────────────────────────────────────────
  { key: "fotos_dia", tipo: "fotos", destino: { coluna: "fotos_dia" },
    pergunta: "📷 Por fim, envie as *fotos do andamento do dia*.\nEnvie quantas quiser e depois escreva *pronto*. (ou *pular* se não houver)" },
];
