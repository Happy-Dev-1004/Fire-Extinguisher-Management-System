import { useEffect, useState, useCallback } from "react";
import {
  alarmeApi,
  type DispositivoInstalado,
  type DispositivoAlarme,
  type RelatorioArmazenamento,
} from "../lib/api";
import { toast } from "../components/Toast";
import {
  Camera, Calendar, HardDrive, ChevronLeft, ImageOff, X,
  Loader2, MapPin, Cpu,
} from "lucide-react";

// pt-BR labels for the device type enum.
const TIPO_LABEL: Record<string, string> = {
  detector_fumaca: "Detector de fumaça",
  detector_temperatura: "Detector de temperatura",
  detector_linear: "Detector linear",
  acionador: "Acionador manual",
  sirene: "Sirene / Avisador",
  modulo_supervisao: "Módulo de supervisão",
  isolador: "Isolador",
  outro: "Outro",
};

const STATUS_BADGE: Record<string, string> = {
  pendente: "badge-gray",
  instalado: "badge-brand",
  enderecado: "badge-brand",
  testado: "badge-brand",
};

// Date-only ISO ("2026-06-18") formatted as dd/mm/aaaa WITHOUT timezone shifting
// (new Date() would treat it as UTC midnight and roll back a day in BRT).
function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Today's date as yyyy-mm-dd for the date input default.
function hojeInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AlarmeFotosPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [aba, setAba] = useState<"data" | "armazenamento">("data");

  return (
    <div className="space-y-6">
      {!embedded && (
        <header>
          <div className="flex items-center gap-2 text-brand-600">
            <Camera className="w-5 h-5" />
            <h1 className="text-xl font-bold text-gray-900">Registro fotográfico — Alarme</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Galeria de fotos dos dispositivos instalados e relatório de armazenamento.
          </p>
        </header>
      )}

      {/* Segmented tabs */}
      <div className="inline-flex rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setAba("data")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            aba === "data" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calendar className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Por data
        </button>
        <button
          onClick={() => setAba("armazenamento")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            aba === "armazenamento" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <HardDrive className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Armazenamento
        </button>
      </div>

      {aba === "data" ? <PorDataView /> : <ArmazenamentoView />}
    </div>
  );
}

// ── "Devices installed on date X" view ───────────────────────────────────────────
function PorDataView() {
  const [data, setData] = useState(hojeInput());
  const [central, setCentral] = useState<string>("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ total: number; dispositivos: DispositivoInstalado[] } | null>(null);
  const [selecionado, setSelecionado] = useState<DispositivoInstalado | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setSelecionado(null);
    try {
      const centralNum = central ? Number(central) : undefined;
      const r = await alarmeApi.instaladosEm(data, centralNum);
      setResultado({ total: r.total, dispositivos: r.dispositivos });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao buscar dispositivos.", "erro");
      setResultado(null);
    } finally {
      setCarregando(false);
    }
  }, [data, central]);

  useEffect(() => { buscar(); /* initial load for today */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Data de instalação</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Central (opcional)</label>
          <select value={central} onChange={(e) => setCentral(e.target.value)} className="input">
            <option value="">Todas</option>
            <option value="1">Central 1</option>
            <option value="2">Central 2</option>
            <option value="3">Central 3</option>
            <option value="4">Central 4</option>
          </select>
        </div>
        <button onClick={buscar} className="btn-primary" disabled={carregando}>
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
        </button>
      </div>

      {selecionado ? (
        <DispositivoGaleria
          dispositivo={selecionado}
          onVoltar={() => setSelecionado(null)}
          onAbrir={(url) => setLightbox(url)}
        />
      ) : (
        <>
          {resultado && (
            <p className="text-sm text-gray-500">
              {resultado.total === 0
                ? "Nenhum dispositivo instalado nesta data."
                : `${resultado.total} dispositivo(s) instalado(s) em ${dataBR(data)}.`}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {resultado?.dispositivos.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelecionado(d)}
                className="card overflow-hidden text-left hover:shadow-md transition-shadow group"
              >
                <div className="aspect-video bg-gray-100 relative overflow-hidden">
                  {d.fotos[0] ? (
                    <img
                      src={d.fotos[0]}
                      alt={d.setor ?? "Dispositivo"}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ImageOff className="w-8 h-8" />
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 badge badge-gray bg-black/60 text-white border-0">
                    {d.qtd_fotos} foto(s)
                  </span>
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {TIPO_LABEL[d.tipo_dispositivo] ?? d.tipo_dispositivo}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {d.setor ?? "—"}{d.endereco ? ` · ${d.endereco}` : ""}
                  </p>
                  <span className={`badge ${STATUS_BADGE[d.status_instalacao] ?? "badge-gray"}`}>
                    {d.status_instalacao}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Single-device gallery ────────────────────────────────────────────────────────
function DispositivoGaleria({
  dispositivo,
  onVoltar,
  onAbrir,
}: {
  dispositivo: DispositivoInstalado;
  onVoltar: () => void;
  onAbrir: (url: string) => void;
}) {
  // Re-fetch the full device (the list payload already has fotos, but this keeps
  // the gallery fresh if photos changed).
  const [disp, setDisp] = useState<DispositivoAlarme | DispositivoInstalado>(dispositivo);

  useEffect(() => {
    alarmeApi.dispositivo(dispositivo.id).then(setDisp).catch(() => {/* keep list copy */});
  }, [dispositivo.id]);

  return (
    <div className="space-y-4">
      <button onClick={onVoltar} className="btn-ghost text-sm inline-flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" /> Voltar à lista
      </button>

      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {TIPO_LABEL[disp.tipo_dispositivo] ?? disp.tipo_dispositivo}
            </h2>
            <p className="text-sm text-gray-500">
              {disp.setor ?? "—"}
              {disp.endereco ? ` · ${disp.endereco}` : disp.laco != null ? ` · Laço ${disp.laco}` : ""}
              {" · "}Instalado em {dataBR(disp.data_instalacao)}
            </p>
          </div>
        </div>
      </div>

      {disp.fotos.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <ImageOff className="w-10 h-10 mx-auto mb-2" />
          Este dispositivo ainda não tem fotos.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {disp.fotos.map((url, i) => (
            <button
              key={url}
              onClick={() => onAbrir(url)}
              className="aspect-square rounded-lg overflow-hidden bg-gray-100 group"
            >
              <img
                src={url}
                alt={`Foto ${i + 1}`}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Fechar">
        <X className="w-7 h-7" />
      </button>
      <img
        src={url}
        alt="Foto ampliada"
        className="max-w-full max-h-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Storage report view ──────────────────────────────────────────────────────────
function ArmazenamentoView() {
  const [rel, setRel] = useState<RelatorioArmazenamento | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    alarmeApi.armazenamento()
      .then(setRel)
      .catch((err) => toast(err instanceof Error ? err.message : "Erro ao carregar relatório.", "erro"))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="card p-10 text-center text-gray-400">
        <Loader2 className="w-8 h-8 mx-auto animate-spin" />
      </div>
    );
  }
  if (!rel) return <p className="text-sm text-gray-500">Sem dados de armazenamento.</p>;

  const cards = [
    { label: "Dispositivos com foto", valor: rel.dispositivos_com_foto },
    { label: "Total de fotos", valor: rel.total_fotos_dispositivos },
    { label: "Média por dispositivo", valor: rel.media_fotos_por_dispositivo },
    { label: "Fotos pendentes (revisão)", valor: rel.total_fotos_pendentes },
    { label: "Armazenamento estimado", valor: rel.bytes_legivel },
    { label: "Acima do alvo", valor: rel.dispositivos_acima_do_alvo.length },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{c.valor}</p>
          </div>
        ))}
      </div>

      {rel.dispositivos_acima_do_alvo.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">
            Dispositivos acima do alvo ({rel.alvo_fotos_por_dispositivo} fotos) — candidatos a arquivamento
          </h3>
          <div className="divide-y divide-gray-100">
            {rel.dispositivos_acima_do_alvo.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{d.setor ?? "—"}{d.endereco ? ` · ${d.endereco}` : ""}</span>
                <span className="badge badge-gray">{d.qtd_fotos} fotos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4 bg-sky-50 border-sky-200">
        <p className="text-sm text-sky-800">
          <strong>Armazenamento:</strong> as fotos dos dispositivos são guardadas com segurança
          e <strong>nunca são apagadas automaticamente</strong>. Quando um dispositivo passa de{" "}
          {rel.alvo_fotos_por_dispositivo} fotos, ele é sinalizado acima para uma eventual
          organização das imagens mais antigas — sempre preservando as mais recentes.
        </p>
      </div>
    </div>
  );
}
