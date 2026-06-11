import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { extintoresApi, relatorioApi } from "../lib/api";
import type { Extintor, Inspecao, Situacao } from "../lib/types";
import { formatarData } from "../lib/formatters";
import {
  ArrowLeft, Flame, AlertTriangle, CheckCircle2, XCircle,
  Clock, HelpCircle, Camera, Calendar, User, MapPin,
  ClipboardList, History, ChevronDown, ChevronUp, Download, Loader2,
} from "lucide-react";

// ── Situacao ──────────────────────────────────────────────────────────────────

const SITUACAO_META: Record<Situacao, { label: string; badgeClass: string; Icon: React.ElementType }> = {
  vencido:       { label: "Vencido",         badgeClass: "badge-red",   Icon: XCircle },
  descartado:    { label: "Descartado",       badgeClass: "badge-red",   Icon: XCircle },
  proximo:       { label: "Próx. vencimento", badgeClass: "badge-amber", Icon: Clock },
  em_dia:        { label: "Em dia",           badgeClass: "badge-green", Icon: CheckCircle2 },
  indeterminado: { label: "Indeterminado",    badgeClass: "badge-gray",  Icon: HelpCircle },
};

function SituacaoBadge({ situacao }: { situacao: Situacao }) {
  const meta = SITUACAO_META[situacao];
  return (
    <span className={`${meta.badgeClass} text-sm px-3 py-1`}>
      <meta.Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

// ── Checklist item ────────────────────────────────────────────────────────────

type ItemStatus = "OK" | "Reprovado" | "N.A" | "Indeterminado" | string | null;

function CheckItem({ label, valor }: { label: string; valor: ItemStatus }) {
  const ok     = valor === "OK";
  const reprov = valor === "Reprovado";
  const na     = valor === "N.A";
  const cls = ok     ? "badge-green"
            : reprov ? "badge-red"
            : na     ? "badge-gray"
            : "badge-gray";
  const text = valor ?? "—";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`${cls} shrink-0`}>
        {ok && <CheckCircle2 className="w-3 h-3" />}
        {reprov && <XCircle className="w-3 h-3" />}
        {text}
      </span>
    </div>
  );
}

const CHECKLIST_LABELS: { key: keyof Inspecao; label: string }[] = [
  { key: "lacre",              label: "Lacre" },
  { key: "vencimento_carga",   label: "Vencimento da carga" },
  { key: "vencimento_teste",   label: "Vencimento do teste" },
  { key: "manometro",          label: "Manômetro" },
  { key: "sinalizacao_parede", label: "Sinalização parede" },
  { key: "sinalizacao_piso",   label: "Sinalização piso" },
  { key: "suporte",            label: "Suporte / Abrigo" },
  { key: "mangueira",          label: "Mangueira" },
  { key: "quadro_instrucao",   label: "Quadro de instrução" },
];

// ── Vencimento display ────────────────────────────────────────────────────────

function VencimentoBig({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-gray-300 text-sm">Não informado</span>
    </div>
  );
  const now = new Date();
  const parts = valor.match(/(\d{2,4})/g);
  const year = parts ? parseInt(parts[parts.length - 1]) : 9999;
  const fullYear = year < 100 ? 2000 + year : year;
  const cls = fullYear < now.getFullYear() ? "text-red-600 font-bold"
            : fullYear === now.getFullYear() ? "text-amber-600 font-semibold"
            : "text-gray-900 font-semibold";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-lg ${cls}`}>{valor}</span>
    </div>
  );
}

// ── Photo grid ────────────────────────────────────────────────────────────────

function FotoGrid({ fotos }: { fotos: string[] }) {
  if (!fotos.length) return (
    <div className="flex items-center gap-2 py-6 text-gray-300">
      <Camera className="w-5 h-5" />
      <span className="text-sm">Nenhuma foto registrada.</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {fotos.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
          className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
        >
          <img
            src={url}
            alt={`Foto ${i + 1}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "";
              (e.target as HTMLImageElement).parentElement!.innerHTML =
                `<div class="w-full h-full flex items-center justify-center text-gray-300 text-xs">Imagem indisponível</div>`;
            }}
          />
          <div className="absolute bottom-1 right-1 bg-black/40 rounded text-white text-[10px] px-1">{i + 1}</div>
        </a>
      ))}
    </div>
  );
}

// ── Inspection history row ────────────────────────────────────────────────────

function InspecaoRow({ insp, defaultOpen }: { insp: Inspecao; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const irregular = insp.tem_irregularidade;
  return (
    <div className={`border rounded-xl overflow-hidden ${irregular ? "border-red-200" : "border-gray-200"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
          irregular ? "bg-red-50/60 hover:bg-red-50" : "bg-white hover:bg-gray-50"
        }`}
      >
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{insp.mes_referencia}</span>
            <span className="text-xs text-gray-400">{formatarData(insp.data_inspecao)}</span>
            {insp.status_geral && (
              <span className={irregular ? "badge-red text-[10px]" : "badge-green text-[10px]"}>
                {insp.status_geral}
              </span>
            )}
            {irregular && <span className="badge-red text-[10px]">⚠ Irregular</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            <User className="w-3 h-3 inline mr-1" />{insp.inspetor}
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-white">
          {/* Checklist */}
          <div>
            <p className="section-title mb-2">Checklist</p>
            <div className="divide-y divide-gray-100">
              {CHECKLIST_LABELS.map(({ key, label }) => (
                <CheckItem key={key} label={label} valor={insp[key] as ItemStatus} />
              ))}
            </div>
          </div>

          {/* Observations */}
          {insp.observacoes && (
            <div>
              <p className="section-title mb-1">Observações</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{insp.observacoes}</p>
            </div>
          )}

          {/* Photos */}
          {insp.fotos?.length > 0 && (
            <div>
              <p className="section-title mb-2">Fotos ({insp.fotos.length})</p>
              <FotoGrid fotos={insp.fotos} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExtintorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [extintor, setExtintor]     = useState<Extintor | null>(null);
  const [inspecoes, setInspecoes]   = useState<Inspecao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState("");
  const [dlPdf, setDlPdf]           = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      setCarregando(true);
      setErro("");
      try {
        const { extintor: ext, inspecoes: insps } = await extintoresApi.detalhe(id);
        if (active) { setExtintor(ext); setInspecoes(insps); }
      } catch (e: unknown) {
        if (active) setErro(e instanceof Error ? e.message : "Erro ao carregar extintor.");
      } finally {
        if (active) setCarregando(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  if (carregando) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="skeleton w-8 h-8 rounded-lg" />
          <div className="skeleton h-7 w-40" />
        </div>
        <div className="card p-6 space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-4 w-full" />)}
        </div>
        <div className="card p-6 space-y-3">
          {[...Array(9)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}
        </div>
      </div>
    );
  }

  if (erro || !extintor) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={() => navigate("/extintores")} className="btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="card p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{erro || "Extintor não encontrado."}</p>
        </div>
      </div>
    );
  }

  const situacao = extintor.situacao ?? "indeterminado";
  const ultimaInsp = inspecoes[0] ?? null;

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      {/* Back */}
      <button onClick={() => navigate("/extintores")} className="btn-ghost btn-sm -ml-1">
        <ArrowLeft className="w-4 h-4" /> Extintores
      </button>

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="page-title">Extintor {extintor.numero}</h1>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              {extintor.unidade}
              {extintor.setor && <> · {extintor.setor}</>}
            </div>
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <SituacaoBadge situacao={situacao} />
          <button
            onClick={async () => {
              setDlPdf(true);
              try { await relatorioApi.extintor(extintor.id, extintor.unidade, extintor.numero); }
              catch { /* toast shown by api */ }
              finally { setDlPdf(false); }
            }}
            disabled={dlPdf}
            className="btn btn-secondary flex items-center gap-1.5 text-sm"
            title="Baixar relatório PDF deste extintor"
          >
            {dlPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </button>
        </div>
      </div>

      {/* Identity card */}
      <div className="card p-5">
        <p className="section-title mb-4">Identificação</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoCell label="Número"       value={extintor.numero} />
          <InfoCell label="Unidade"      value={extintor.unidade} />
          <InfoCell label="Setor"        value={extintor.setor || "—"} />
          <InfoCell label="Tipo / Carga" value={extintor.tipo_carga} />
          <InfoCell label="Capacidade"   value={extintor.capacidade || "—"} />
          <InfoCell label="Cadastro"     value={extintor.cadastro_pendente ? "Pendente" : "Confirmado"} />
        </div>

        {/* Vencimentos — big and color-coded */}
        <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 gap-4">
          <VencimentoBig label="Vencimento da carga" valor={extintor.vencimento_carga} />
          <VencimentoBig label="Vencimento do teste" valor={extintor.vencimento_teste} />
        </div>

        {/* Descartado info */}
        {extintor.status_ativo === false && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <span className="font-semibold">Descartado</span>
              {extintor.data_baixa && <> em {formatarData(extintor.data_baixa)}</>}
              {extintor.motivo_baixa && <> — {extintor.motivo_baixa}</>}
            </div>
          </div>
        )}
      </div>

      {/* Latest inspection checklist */}
      {ultimaInsp ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title">Última inspeção</p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="w-3.5 h-3.5" />
              {formatarData(ultimaInsp.data_inspecao)}
              <User className="w-3.5 h-3.5 ml-1" />
              {ultimaInsp.inspetor}
            </div>
          </div>

          {ultimaInsp.tem_irregularidade && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-4">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-800 font-medium">Irregularidade detectada — verifique o checklist.</p>
            </div>
          )}

          <div>
            {CHECKLIST_LABELS.map(({ key, label }) => (
              <CheckItem key={key} label={label} valor={ultimaInsp[key] as ItemStatus} />
            ))}
          </div>

          {ultimaInsp.observacoes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="section-title mb-2">Observações</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ultimaInsp.observacoes}</p>
            </div>
          )}

          {ultimaInsp.fotos?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="section-title mb-3">
                <Camera className="w-3.5 h-3.5 inline mr-1" />
                Fotos ({ultimaInsp.fotos.length})
              </p>
              <FotoGrid fotos={ultimaInsp.fotos} />
            </div>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center border-dashed">
          <ClipboardList className="w-9 h-9 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhuma inspeção registrada ainda.</p>
          <p className="text-xs text-gray-300 mt-1">
            As inspeções são registradas automaticamente via fotos WhatsApp.
          </p>
        </div>
      )}

      {/* Inspection history */}
      {inspecoes.length > 1 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            <p className="section-title">Histórico de inspeções ({inspecoes.length})</p>
          </div>
          <div className="space-y-2">
            {inspecoes.map((insp, idx) => (
              <InspecaoRow key={insp.id} insp={insp} defaultOpen={idx === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
