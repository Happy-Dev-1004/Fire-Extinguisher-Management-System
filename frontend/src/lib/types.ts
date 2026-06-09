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
  created_at: string;
}

export interface Inspecao {
  id: string;
  extintor_numero: string;
  extintor_unidade: string;
  mes_referencia: string;
  data_inspecao: string;
  inspetor: string;
  status_geral: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface Configuracao {
  nome: string;
  configurado: boolean;
  valor_mascarado: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface ApiError {
  erro?: string;
  error?: string;
  message?: string;
}
