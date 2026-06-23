export type Role = "owner" | "member";

export interface AdminProfile {
  email: string;
  nome: string;
  role: Role;
}

export interface AdminMember {
  id: string;
  email: string;
  nome: string;
  role: Role;
  ativo: boolean;
  created_at: string;
}

export interface Convite {
  id: string;
  email: string;
  status: string;
  expira_em: string;
  created_at: string;
}

export type Situacao = "descartado" | "vencido" | "proximo" | "em_dia" | "indeterminado";

// ── Regional inventory ────────────────────────────────────────────────────────
export type StatusInspecao = "nao_inspecionado" | "aguardando_verificacao" | "verificado";

export interface RegiaoProgresso {
  nome:                   string;
  total_esperado:         number;
  total_cadastrado:       number;
  nao_inspecionado:       number;
  aguardando_verificacao: number;
  verificado:             number;
  inspecionados:          number;
  pct_inspecionado:       number;
  pct_verificado:         number;
}

export interface CicloAtivo {
  id:             string;
  mes_referencia: string;
  iniciado_em:    string;
}

// ── Phase 3 · Hydrants ────────────────────────────────────────────────────────
export type SituacaoHidrante = "atencao" | "pendente" | "ok" | "indeterminado";

export interface UnidadeHidranteProgresso {
  nome:                   string;
  total_esperado:         number;
  total_cadastrado:       number;
  nao_inspecionado:       number;
  aguardando_verificacao: number;
  verificado:             number;
  inspecionados:          number;
  pct_inspecionado:       number;
  pct_verificado:         number;
}

export interface Hidrante {
  id:                    string;
  numero:                string;
  numero_int:            number | null;
  unidade:               string;
  setor:                 string | null;
  // constants
  esguicho:              string | null;
  mangueira:             string | null;
  chave_storz:           string | null;
  // checklist (4-state)
  c_esguicho:            string | null;
  c_condicoes_caixa:     string | null;
  c_condicoes_acesso:    string | null;
  c_identificacao_piso:  string | null;
  c_identificacao_placa: string | null;
  c_mangueira:           string | null;
  c_adaptador:           string | null;
  c_chave_storz:         string | null;
  c_teste:               string | null;
  c_tampa_hidrante:      string | null;
  status_geral:          string | null;
  observacoes:           string | null;
  inspetor:              string | null;
  fotos:                 string[];
  status_inspecao:       StatusInspecao;
  verificado_em:         string | null;
  inspecionado_em:       string | null;
  situacao:              SituacaoHidrante;
}

export interface UnidadeHidrante {
  id:              string;
  nome:            string;
  total_hidrantes: number;
  ordem:           number;
  created_at:      string;
}

export interface ExtintorRegiao {
  id:                 string;
  numero:             string;
  numero_int:         number | null;
  regiao:             string;
  setor:              string;
  tipo_carga:         string;
  capacidade:         string | null;
  vencimento_carga:   string | null;
  vencimento_teste:   string | null;
  inspetor:           string | null;
  lacre:              string | null;
  manometro:          string | null;
  sinalizacao_parede: string | null;
  sinalizacao_piso:   string | null;
  suporte:            string | null;
  mangueira:          string | null;
  quadro_instrucao:   string | null;
  status_geral:       string | null;
  observacoes:        string | null;
  fotos:              string[];
  status_inspecao:    StatusInspecao;
  verificado_em:      string | null;
  inspecionado_em:    string | null;
  situacao:           Situacao;
}

export interface UltimaInspecaoResumo {
  status_geral:       string | null;
  data_inspecao:      string;
  tem_irregularidade: boolean | null;
  inspetor:           string;
  mes_referencia:     string;
}

export interface Extintor {
  id: string;
  numero: string;
  unidade: string;
  setor: string;
  tipo_carga: string;
  capacidade: string | null;
  vencimento_carga: string | null;
  vencimento_teste: string | null;
  cadastro_pendente: boolean;
  status_ativo: boolean;
  data_baixa: string | null;
  motivo_baixa: string | null;
  created_at: string;
  // enriched by GET /extintores
  situacao?: Situacao;
  ultima_inspecao?: UltimaInspecaoResumo | null;
}

export interface Inspecao {
  id: string;
  extintor_numero: string;
  extintor_unidade: string;
  mes_referencia: string;
  data_inspecao: string;
  inspetor: string;
  lacre: string | null;
  vencimento_carga: string | null;
  vencimento_teste: string | null;
  manometro: string | null;
  sinalizacao_parede: string | null;
  sinalizacao_piso: string | null;
  suporte: string | null;
  mangueira: string | null;
  quadro_instrucao: string | null;
  status_geral: string | null;
  observacoes: string | null;
  fotos: string[];
  tem_irregularidade: boolean | null;
  lote_id: string | null;
  created_at: string;
}

export interface Configuracao {
  nome: string;
  configurado: boolean;
  valor_mascarado: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface Inspetor {
  id: string;
  nome: string;
  telefone: string;
  telefone_normalizado: string;
  unidade: string;            // fixed unit this inspector covers
  ativo: boolean;
  pode_fase1?: boolean;       // permission: Phase 1 (extintores)
  pode_fase2?: boolean;       // permission: Phase 2 (alarme — RDO + device photos)
  pode_fase3?: boolean;       // permission: Phase 3 (hidrantes)
  em_sessao?: boolean;        // Phase 1 work session open
  em_sessao_fase2?: boolean;  // Phase 2 work session open
  em_sessao_fase3?: boolean;  // Phase 3 work session open
  created_at: string;
  updated_at: string;
}

export interface Destinatario {
  id: string;
  nome: string;
  telefone: string;
  telefone_normalizado: string;
  email: string | null;
  unidade: string; // site name or "*" for all units
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface DestinatarioResolvido {
  id: string;
  nome: string;
  telefone: string;
  telefone_normalizado: string;
  email: string | null;
  unidade: string;
}

export interface ResultadoEnvio {
  destinatario: { id: string; nome: string; telefone: string };
  ok: boolean;
  motivo?: string;
}

// Per-channel send status for one recipient (WhatsApp + e-mail).
export interface CanalStatus {
  tentado: boolean;
  ok: boolean;
  motivo?: string;
}

export interface ResultadoEnvioMulti {
  destinatario: { id: string; nome: string; telefone: string; email: string | null };
  whatsapp: CanalStatus;
  email: CanalStatus;
}

export interface ApiError {
  erro?: string;
  error?: string;
  message?: string;
}

// ── Busca / Relatório ─────────────────────────────────────────────────────────

export interface InspecaoResumo {
  id: string;
  mes_referencia: string;
  data_inspecao: string;
  inspetor: string;
  status_geral: string | null;
  tem_irregularidade: boolean | null;
}

export interface ResultadoBusca {
  id: string;
  numero: string;
  unidade: string;
  setor: string;
  tipo_carga: string;
  capacidade: string | null;
  vencimento_carga: string | null;
  vencimento_teste: string | null;
  status_ativo: boolean;
  data_baixa: string | null;
  motivo_baixa: string | null;
  cadastro_pendente: boolean;
  created_at: string;
  situacao: Situacao;
  ultima_inspecao: InspecaoResumo | null;
}

export interface AggregateCounts {
  total: number;
  em_dia: number;
  proximo: number;
  vencido: number;
  descartado: number;
  indeterminado: number;
  com_irregularidade: number;
}

export interface PaginaBusca {
  resultados: ResultadoBusca[];
  total: number;
  pagina: number;
  total_paginas: number;
  contagens: AggregateCounts;
}

export interface FiltrosBusca {
  regiao?: string;
  unidade?: string;
  setor?: string;
  numero?: string;
  tipo_carga?: string;
  situacao?: Situacao;
  status_geral?: string;
  tem_irregularidade?: boolean;
  mes_referencia?: string;
  inspetor?: string;
  vence_em_dias?: number;
  page?: number;
}
