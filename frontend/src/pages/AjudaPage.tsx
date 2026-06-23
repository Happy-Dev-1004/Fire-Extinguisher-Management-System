import { useState } from "react";
import {
  HelpCircle, Smartphone, LayoutDashboard, ChevronDown, MapPin, Camera,
  CheckCircle2, PlayCircle, StopCircle, ShieldCheck, Clock, Circle, FileText,
  Send, Users, CalendarDays, Flame, Search, Settings, AlertTriangle,
  Hash, Tag, Gauge, SignpostBig, Info, Bell, Activity, Image as ImageIcon, Droplets,
} from "lucide-react";

type Aba = "inspetores" | "usuarios";

export function AjudaPage() {
  const [aba, setAba] = useState<Aba>("inspetores");

  const TABS: { id: Aba; label: string; Icon: typeof Smartphone }[] = [
    { id: "inspetores", label: "Para inspetores", Icon: Smartphone },
    { id: "usuarios",   label: "Para usuários",   Icon: LayoutDashboard },
  ];

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <HelpCircle className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="page-title">Central de Ajuda</h1>
          <p className="text-sm text-gray-500 mt-1">
            Guias de uso do sistema — para inspetores em campo e para usuários do painel.
          </p>
        </div>
      </div>

      {/* Segmented tabs */}
      <div className="inline-flex p-1 bg-gray-100 rounded-xl">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              aba === id
                ? "bg-white text-brand-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {aba === "inspetores" ? <GuiaInspetores /> : <GuiaUsuarios />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INSPECTOR GUIDE (WhatsApp flow)
// ════════════════════════════════════════════════════════════════════════════

const REGIOES = ["Barry Itabuna", "Ilhéus", "CW Itabuna", "CW Ilhéus", "Viveiro Itabuna", "Viveiro Ilhéus"];

const FOTO_ITENS = [
  { Icon: Tag,         destaque: true, texto: "A etiqueta/selo com as datas de vencimento — nítida e de perto" },
  { Icon: Gauge,       texto: "O manômetro (o ponteiro de pressão)" },
  { Icon: Flame,       texto: "O extintor inteiro na parede (suporte, mangueira, sinalização)" },
  { Icon: SignpostBig, texto: "O piso / localização (sinalização de piso)" },
];

// Inspector guide with a phase sub-toggle (1 = extintores, 2 = alarme, 3 = hidrantes).
function GuiaInspetores() {
  const [fase, setFase] = useState<1 | 2 | 3>(1);
  const btn = (n: 1 | 2 | 3) => `inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
    fase === n ? "bg-white text-brand-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`;
  return (
    <div className="space-y-6">
      {/* Phase sub-toggle */}
      <div className="inline-flex p-1 bg-gray-100 rounded-xl flex-wrap">
        <button onClick={() => setFase(1)} className={btn(1)}><Flame className="w-4 h-4" /> Fase 1 · Extintores</button>
        <button onClick={() => setFase(2)} className={btn(2)}><Bell className="w-4 h-4" /> Fase 2 · Alarme</button>
        <button onClick={() => setFase(3)} className={btn(3)}><Droplets className="w-4 h-4" /> Fase 3 · Hidrantes</button>
      </div>

      {fase === 1 ? <GuiaInspetoresFase1 /> : fase === 2 ? <GuiaInspetoresFase2 /> : <GuiaInspetoresFase3 />}
    </div>
  );
}

function GuiaInspetoresFase1() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed">
        Os inspetores enviam as fotos dos extintores diretamente pelo <strong>WhatsApp</strong>.
        O sistema lê as fotos com inteligência artificial e registra cada extintor automaticamente.
        Siga os passos abaixo.
      </p>

      {/* Step 1 */}
      <PassoCard n={1} Icon={PlayCircle} titulo="Inicie a sessão de trabalho">
        <p>Antes de tudo, envie a mensagem para <strong>ativar a sua sessão</strong>:</p>
        <Comando>Iniciar</Comando>
        <p className="mt-3">
          A partir daí, suas fotos passam a ser analisadas. Enquanto a sessão não estiver iniciada,
          as fotos são <strong>ignoradas</strong> — isso evita gastar recursos com fotos que não são de extintores.
        </p>
        <Nota>
          A sessão continua aberta por <strong>vários extintores e regiões</strong> — você inicia uma vez.
          Ela fecha quando você enviar <Inline>Encerrar</Inline> (ou sozinha após 3 horas sem mensagens).
        </Nota>
      </PassoCard>

      {/* Step 2 */}
      <PassoCard n={2} Icon={MapPin} titulo="Informe a região">
        <p>Antes de fotografar, envie o <strong>nome da região</strong> onde você está:</p>
        <Comando>Barry Itabuna</Comando>
        <p className="mt-3 mb-2 text-gray-500">Regiões válidas:</p>
        <div className="flex flex-wrap gap-1.5">
          {REGIOES.map((r) => <span key={r} className="badge-brand">{r}</span>)}
        </div>
        <Nota>
          Você só precisa enviar a região <strong>uma vez</strong>. Todos os extintores seguintes ficam
          nessa região, até você trocar.
        </Nota>
      </PassoCard>

      {/* Step 3 */}
      <PassoCard n={3} Icon={Camera} titulo="Fotografe cada extintor (4 a 6 fotos)">
        <p>
          Para <strong>cada extintor</strong>, selecione de <strong>4 a 6 fotos juntas</strong> na galeria
          e envie como <strong>um único álbum</strong>. As fotos devem cobrir todas as informações:
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FOTO_ITENS.map(({ Icon, texto, destaque }) => (
            <div
              key={texto}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                destaque
                  ? "border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/10"
                  : "border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/40"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${destaque ? "text-brand-600 dark:text-brand-400" : "text-gray-400"}`} />
              <span className={`text-sm ${destaque ? "text-gray-800 dark:text-gray-100 font-medium" : "text-gray-600"}`}>{texto}</span>
            </div>
          ))}
        </div>
        <Nota tipo="alerta">
          A foto da etiqueta precisa estar <strong>focada e bem iluminada</strong> — senão o sistema não
          consegue ler as datas de vencimento.
        </Nota>
      </PassoCard>

      {/* Step 4 */}
      <PassoCard n={4} Icon={Hash} titulo="Envie o número do extintor">
        <p>Logo após o álbum, mande o <strong>número do extintor</strong> (o da etiqueta amarela) como texto:</p>
        <Comando>18</Comando>
        <p className="mt-3">
          O número <strong>conclui aquele extintor</strong> e a IA analisa o álbum. A sessão continua aberta —
          siga para o próximo: novo álbum, depois o novo número.
        </p>
        <Nota>Não é preciso enviar "Fim". O próprio número é o sinal de que o extintor terminou.</Nota>
      </PassoCard>

      {/* Step 5 */}
      <PassoCard n={5} Icon={StopCircle} titulo="Encerre ao final do trabalho">
        <p>Quando terminar <strong>todo o trabalho</strong> (todos os extintores, em todas as regiões), envie:</p>
        <Comando>Encerrar</Comando>
        <p className="mt-3">
          A sessão fecha. A partir daí, fotos enviadas <strong>não são mais processadas</strong> até você
          enviar <Inline>Iniciar</Inline> novamente.
        </p>
      </PassoCard>

      {/* Example timeline */}
      <div className="card p-5">
        <p className="section-title mb-4">Exemplo de uma sessão</p>
        <ol className="space-y-2.5">
          <Linha cor="text-brand-600" Icon={PlayCircle} cmd="Iniciar" desc="abre a sessão" />
          <Linha cor="text-emerald-600" Icon={MapPin} cmd="Barry Itabuna" desc="informa a região" />
          <Linha cor="text-gray-400" Icon={Camera} cmd="álbum (4–6 fotos)" desc="extintor 58" plain />
          <Linha cor="text-amber-600" Icon={Hash} cmd="58" desc="conclui o extintor 58" />
          <Linha cor="text-gray-400" Icon={Camera} cmd="álbum (4–6 fotos)" desc="extintor 59" plain />
          <Linha cor="text-amber-600" Icon={Hash} cmd="59" desc="conclui o extintor 59" />
          <Linha cor="text-emerald-600" Icon={MapPin} cmd="Ilhéus" desc="troca de região" />
          <Linha cor="text-gray-400" Icon={Camera} cmd="álbum (4–6 fotos)" desc="extintor 12" plain />
          <Linha cor="text-amber-600" Icon={Hash} cmd="12" desc="conclui o extintor 12" />
          <Linha cor="text-rose-600" Icon={StopCircle} cmd="Encerrar" desc="fim do trabalho" />
        </ol>
      </div>

      {/* Rules */}
      <div className="card p-5">
        <p className="section-title mb-3 flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5" /> Regras importantes
        </p>
        <ul className="space-y-2.5 text-sm text-gray-700">
          <Regra>Sempre envie <Inline>Iniciar</Inline> <strong>antes</strong> de mandar fotos — fora da sessão, as fotos são ignoradas.</Regra>
          <Regra>O <strong>número</strong> conclui um extintor. <Inline>Encerrar</Inline> fecha a <strong>sessão inteira</strong> no fim do trabalho.</Regra>
          <Regra>Envie as fotos pelo <strong>chat direto</strong> — não em grupo — e como <strong>álbum</strong> (selecionadas juntas).</Regra>
          <Regra>O número deve ser o da <strong>etiqueta amarela</strong> do extintor.</Regra>
          <Regra>Para <strong>trocar de região</strong>, envie o novo nome da região e continue.</Regra>
          <Regra>Seu número de WhatsApp precisa estar <strong>cadastrado como inspetor</strong> no painel.</Regra>
        </ul>
      </div>
    </div>
  );
}

// ── Phase 2 (alarme) inspector guide ──────────────────────────────────────────
function GuiaInspetoresFase2() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed">
        Na Fase 2, a equipe de alarme usa o <strong>WhatsApp</strong> para registrar o
        <strong> Relatório Diário de Obra (RDO)</strong> e as <strong>fotos dos dispositivos</strong> instalados.
        Seu número precisa ter <strong>permissão de Fase 2</strong> no painel (Inspetores).
      </p>

      {/* Step 1 — open the alarm session */}
      <PassoCard n={1} Icon={Bell} titulo="Inicie o modo Alarme">
        <p>Antes de tudo, ative o trabalho de Fase 2:</p>
        <Comando>alarme</Comando>
        <p className="mt-3">
          A partir daí você pode registrar o RDO e as fotos dos dispositivos. Ao terminar o dia, envie
          <Inline>encerrar alarme</Inline> (ou a sessão fecha sozinha após 3 horas sem mensagens).
        </p>
        <Nota>Sem permissão de <strong>Fase 2</strong>, as mensagens de alarme são ignoradas — peça ao gestor para liberar no painel.</Nota>
      </PassoCard>

      {/* Step 2 — RDO */}
      <PassoCard n={2} Icon={FileText} titulo="Faça o RDO (relatório diário)">
        <p>Para abrir o relatório do dia, envie:</p>
        <Comando>RDO</Comando>
        <p className="mt-3">
          O sistema faz <strong>uma pergunta de cada vez</strong> (data, responsável, período, efetivo,
          dispositivos instalados, etc.). Basta responder cada uma. No final, envie as
          <strong> fotos do dia</strong> e escreva <Inline>pronto</Inline> para concluir.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/40">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
            <span className="text-sm text-gray-600"><Inline>voltar</Inline> corrige a resposta anterior</span>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/40">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
            <span className="text-sm text-gray-600"><Inline>cancelar</Inline> descarta e recomeça o RDO</span>
          </div>
        </div>
        <Nota>Você pode responder a data como <Inline>hoje</Inline>, e pular perguntas opcionais com <Inline>pular</Inline>.</Nota>
      </PassoCard>

      {/* Step 3 — device photos */}
      <PassoCard n={3} Icon={Camera} titulo="Registre as fotos de um dispositivo">
        <p>Para vincular fotos a um dispositivo instalado, envie:</p>
        <Comando>dispositivo</Comando>
        <p className="mt-3">
          Em seguida, informe <strong>qual dispositivo</strong> (pelo endereço, ex.: <Inline>L1.05</Inline>,
          ou por <strong>setor + tipo</strong>, ex.: <Inline>Torrefação sirene</Inline>) e <strong>envie as fotos</strong> dele.
          Cada foto é anexada e o dispositivo passa para <strong>instalado</strong>. Ao terminar, escreva
          <Inline>encerrar dispositivo</Inline>.
        </p>
        <Nota tipo="alerta">
          Se enviar uma foto <strong>sem identificar</strong> o dispositivo (ou com um nome que não existe),
          ela <strong>não é perdida</strong> — fica guardada para revisão no painel.
        </Nota>
      </PassoCard>

      {/* Step 4 — close */}
      <PassoCard n={4} Icon={StopCircle} titulo="Encerre ao final do dia">
        <p>Quando terminar o trabalho de alarme, envie:</p>
        <Comando>encerrar alarme</Comando>
        <p className="mt-3">A sessão de Fase 2 fecha. Envie <Inline>alarme</Inline> de novo no próximo dia.</p>
      </PassoCard>

      {/* Example timeline */}
      <div className="card p-5">
        <p className="section-title mb-4">Exemplo de um dia de alarme</p>
        <ol className="space-y-2.5">
          <Linha cor="text-brand-600" Icon={Bell} cmd="alarme" desc="abre o modo Fase 2" />
          <Linha cor="text-emerald-600" Icon={FileText} cmd="RDO" desc="inicia o relatório do dia" />
          <Linha cor="text-gray-400" Icon={CheckCircle2} cmd="responde as perguntas + fotos" desc="e escreve 'pronto'" plain />
          <Linha cor="text-emerald-600" Icon={Camera} cmd="dispositivo" desc="entra no registro de fotos" />
          <Linha cor="text-gray-400" Icon={Tag} cmd="Torrefação sirene" desc="identifica o dispositivo" plain />
          <Linha cor="text-gray-400" Icon={Camera} cmd="fotos do dispositivo" desc="ficam vinculadas" plain />
          <Linha cor="text-amber-600" Icon={StopCircle} cmd="encerrar dispositivo" desc="fecha o registro de fotos" />
          <Linha cor="text-rose-600" Icon={StopCircle} cmd="encerrar alarme" desc="fim do dia" />
        </ol>
      </div>

      {/* Rules */}
      <div className="card p-5">
        <p className="section-title mb-3 flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5" /> Regras importantes
        </p>
        <ul className="space-y-2.5 text-sm text-gray-700">
          <Regra>Sempre envie <Inline>alarme</Inline> <strong>antes</strong> de registrar RDO ou fotos de dispositivo.</Regra>
          <Regra>Para as fotos de dispositivo, <strong>identifique o dispositivo primeiro</strong>, depois envie as fotos.</Regra>
          <Regra>O <strong>RDO</strong> e o <strong>registro de dispositivo</strong> são fluxos separados — cada um tem seu próprio começo e fim.</Regra>
          <Regra>Seu número precisa ter <strong>permissão de Fase 2</strong> no painel (Inspetores).</Regra>
          <Regra>Nada é perdido: fotos sem dispositivo identificado vão para a <strong>revisão</strong> no painel.</Regra>
        </ul>
      </div>
    </div>
  );
}

// ── Phase 3 (hidrantes) inspector guide ───────────────────────────────────────
function GuiaInspetoresFase3() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed">
        Na Fase 3, os inspetores fotografam os <strong>hidrantes</strong> pelo <strong>WhatsApp</strong>,
        no mesmo formato de álbum da Fase 1. O sistema lê as fotos com IA e preenche o checklist de cada
        hidrante. Seu número precisa ter <strong>permissão de Fase 3</strong> no painel (Inspetores).
      </p>

      <PassoCard n={1} Icon={Droplets} titulo="Inicie o modo Hidrantes">
        <p>Antes de tudo, ative a Fase 3:</p>
        <Comando>hidrante</Comando>
        <p className="mt-3">
          A partir daí, suas fotos passam a ser analisadas como hidrantes. Ao terminar, envie
          <Inline>encerrar hidrante</Inline> (ou a sessão fecha sozinha após 3 horas).
        </p>
      </PassoCard>

      <PassoCard n={2} Icon={MapPin} titulo="Informe a unidade">
        <p>Antes de fotografar, envie o <strong>nome da unidade</strong> onde você está (ex.: a unidade do projeto):</p>
        <Comando>EDP</Comando>
        <Nota>Você só envia a unidade <strong>uma vez</strong>. Todos os hidrantes seguintes ficam nessa unidade, até trocar.</Nota>
      </PassoCard>

      <PassoCard n={3} Icon={Camera} titulo="Fotografe cada hidrante (álbum)">
        <p>
          Para <strong>cada hidrante</strong>, envie um <strong>álbum de fotos juntas</strong>. As fotos devem cobrir:
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>a <strong>caixa</strong> aberta (mangueira, esguicho, adaptador, chave Storz, tampa);</li>
          <li>a <strong>placa</strong> de identificação;</li>
          <li>a <strong>sinalização no piso</strong>;</li>
          <li>o conjunto/registro do hidrante (teste, condições gerais).</li>
        </ul>
        <Nota tipo="alerta">Se faltar algo (ex.: <strong>sem esguicho</strong>), a IA marca como <strong>pendente</strong> — registre mesmo assim.</Nota>
      </PassoCard>

      <PassoCard n={4} Icon={Hash} titulo="Envie o número do hidrante">
        <p>Logo após o álbum, mande o <strong>número do hidrante</strong> como texto:</p>
        <Comando>1</Comando>
        <p className="mt-3">O número <strong>conclui aquele hidrante</strong> e a IA analisa o álbum. Siga para o próximo.</p>
        <Nota>Aceita <Inline>1</Inline> ou <Inline>H01</Inline>. Não é preciso enviar "Fim".</Nota>
      </PassoCard>

      <PassoCard n={5} Icon={StopCircle} titulo="Encerre ao final do trabalho">
        <p>Quando terminar todos os hidrantes, envie:</p>
        <Comando>encerrar hidrante</Comando>
      </PassoCard>

      <div className="card p-5">
        <p className="section-title mb-4">Exemplo de uma sessão de hidrantes</p>
        <ol className="space-y-2.5">
          <Linha cor="text-sky-600" Icon={Droplets} cmd="hidrante" desc="abre a Fase 3" />
          <Linha cor="text-emerald-600" Icon={MapPin} cmd="EDP" desc="informa a unidade" />
          <Linha cor="text-gray-400" Icon={Camera} cmd="álbum de fotos" desc="hidrante 1" plain />
          <Linha cor="text-amber-600" Icon={Hash} cmd="1" desc="conclui o hidrante 1" />
          <Linha cor="text-gray-400" Icon={Camera} cmd="álbum de fotos" desc="hidrante 2" plain />
          <Linha cor="text-amber-600" Icon={Hash} cmd="2" desc="conclui o hidrante 2" />
          <Linha cor="text-rose-600" Icon={StopCircle} cmd="encerrar hidrante" desc="fim do trabalho" />
        </ol>
      </div>

      <div className="card p-5">
        <p className="section-title mb-3 flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5" /> Regras importantes
        </p>
        <ul className="space-y-2.5 text-sm text-gray-700">
          <Regra>Sempre envie <Inline>hidrante</Inline> <strong>antes</strong> de mandar fotos.</Regra>
          <Regra>Informe a <strong>unidade</strong> antes do primeiro hidrante; o <strong>número</strong> conclui cada um.</Regra>
          <Regra>Envie as fotos como <strong>álbum</strong> (selecionadas juntas), pelo <strong>chat direto</strong>.</Regra>
          <Regra>Seu número precisa ter <strong>permissão de Fase 3</strong> no painel (Inspetores).</Regra>
          <Regra>Nada é perdido: fotos sem unidade/número válido vão para a <strong>revisão</strong> no painel.</Regra>
        </ul>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// USER GUIDE (dashboard) — articles in an accordion
// ════════════════════════════════════════════════════════════════════════════

interface Artigo {
  id: string;
  Icon: typeof Flame;
  titulo: string;
  resumo: string;
  conteudo: React.ReactNode;
}

const ARTIGOS: Artigo[] = [
  {
    id: "visao-geral",
    Icon: LayoutDashboard,
    titulo: "Visão geral: como o sistema funciona",
    resumo: "O fluxo completo, do campo ao relatório.",
    conteudo: (
      <div className="space-y-3">
        <p>O sistema gerencia a inspeção mensal de todos os extintores, por região. O fluxo é:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li><strong>Inspetor</strong> envia fotos pelo WhatsApp (veja a aba "Para inspetores").</li>
          <li>A <strong>IA</strong> lê as fotos e preenche os dados de cada extintor automaticamente.</li>
          <li>O extintor passa a aguardar <strong>verificação humana</strong>.</li>
          <li>O <strong>usuário</strong> revisa, corrige se necessário, e marca como <strong>verificado</strong>.</li>
          <li>Ao fim do mês, gera-se o <strong>relatório</strong> e inicia-se um novo ciclo.</li>
        </ol>
      </div>
    ),
  },
  {
    id: "extintores",
    Icon: Flame,
    titulo: "Extintores: navegar, editar e verificar",
    resumo: "Regiões → lista de extintores → detalhe.",
    conteudo: (
      <div className="space-y-2">
        <p className="mb-2">A página <strong>Extintores</strong> mostra as 6 regiões com o progresso de cada uma.</p>
        <LinhaArtigo Icon={MapPin}>Clique numa <strong>região</strong> para ver seus extintores em tabela (Nº, setor, tipo, vencimentos, situação, verificação).</LinhaArtigo>
        <LinhaArtigo Icon={Search}>Use a <strong>busca</strong> e os <strong>filtros de status</strong> (Todos / Aguardando / Verificados / Não inspecionados).</LinhaArtigo>
        <LinhaArtigo Icon={FileText}>Clique num <strong>extintor</strong> para ver o detalhe: identificação, checklist, fotos e histórico.</LinhaArtigo>
        <LinhaArtigo Icon={CheckCircle2}>No detalhe, use <strong>"Editar valores"</strong> para corrigir dados e <strong>"Verificação concluída"</strong> para confirmar.</LinhaArtigo>
      </div>
    ),
  },
  {
    id: "status",
    Icon: ShieldCheck,
    titulo: "Os 3 status de inspeção",
    resumo: "Não inspecionado → Aguardando → Verificado.",
    conteudo: (
      <div className="space-y-3">
        <p>Cada extintor tem um status que muda durante o mês:</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2"><span className="badge-gray"><Circle className="w-3 h-3" /> Não inspecionado</span> <span className="text-sm text-gray-600">— ainda sem fotos/dados neste ciclo.</span></div>
          <div className="flex items-center gap-2"><span className="badge-amber"><Clock className="w-3 h-3" /> Aguardando verificação</span> <span className="text-sm text-gray-600">— a IA preencheu, falta a conferência humana.</span></div>
          <div className="flex items-center gap-2"><span className="badge-green"><ShieldCheck className="w-3 h-3" /> Verificado</span> <span className="text-sm text-gray-600">— um usuário revisou e confirmou.</span></div>
        </div>
        <Nota>Se novas fotos chegarem para um extintor já verificado, ele volta para <strong>"Aguardando verificação"</strong>.</Nota>
      </div>
    ),
  },
  {
    id: "relatorios",
    Icon: FileText,
    titulo: "Relatórios: pré-visualizar, baixar e enviar",
    resumo: "Ficha oficial por região, em PDF.",
    conteudo: (
      <div className="space-y-2">
        <p className="mb-2">Há duas páginas para relatórios:</p>
        <LinhaArtigo Icon={FileText}><strong>Fichas</strong> — por região: <em>Pré-visualizar</em>, <em>Baixar PDF</em>, ou <em>Enviar</em> aos destinatários.</LinhaArtigo>
        <LinhaArtigo Icon={Search}><strong>Busca / Relatórios</strong> — relatório por região no formato oficial, além de busca avançada com filtros.</LinhaArtigo>
        <Nota>O relatório usa o <strong>formato oficial de ficha</strong> (checklist por extintor, fotos e rodapé). A pré-visualização abre o PDF na tela.</Nota>
      </div>
    ),
  },
  {
    id: "envio",
    Icon: Send,
    titulo: "Enviar a ficha por WhatsApp ou e-mail",
    resumo: "Escolher o canal e os destinatários.",
    conteudo: (
      <div className="space-y-3">
        <p>Na página <strong>Fichas</strong>, clique em <strong>Enviar</strong> na região desejada:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Confira o mês e os <strong>destinatários</strong> que receberão.</li>
          <li>Escolha o canal: <strong>WhatsApp</strong>, <strong>E-mail</strong> ou <strong>Ambos</strong>.</li>
          <li>O resultado mostra, por destinatário, se cada canal foi entregue ou falhou.</li>
        </ol>
        <Nota>Cadastre quem recebe na página <strong>Destinatários</strong>. Cada pessoa pode ter telefone, e-mail, ou ambos.</Nota>
      </div>
    ),
  },
  {
    id: "novo-mes",
    Icon: CalendarDays,
    titulo: "Iniciar um novo mês (ciclo)",
    resumo: "Arquivar o mês atual e reiniciar.",
    conteudo: (
      <div className="space-y-3">
        <p>Quando a inspeção do mês termina, o <strong>proprietário</strong> inicia o próximo ciclo:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Página <strong>Extintores</strong> → botão <strong>"Iniciar novo mês"</strong>.</li>
          <li>Informe o mês de referência (ex.: Julho/2026).</li>
          <li>Todos os extintores voltam a <strong>"Não inspecionado"</strong>; o mês anterior é arquivado.</li>
        </ol>
        <Nota tipo="alerta">Esta ação <strong>redefine todos os extintores</strong>. Gere e envie os relatórios do mês <strong>antes</strong> de iniciar o novo ciclo.</Nota>
      </div>
    ),
  },
  {
    id: "inspetores-destinatarios",
    Icon: Users,
    titulo: "Inspetores e Destinatários",
    resumo: "Quem envia fotos e quem recebe as fichas.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={Smartphone}><strong>Inspetores</strong> — cadastre o WhatsApp (com DDI, ex.: 5577999999999) de quem fotografa. Só números ativos podem enviar fotos.</LinhaArtigo>
        <LinhaArtigo Icon={Send}><strong>Destinatários</strong> — cadastre quem recebe as fichas por região, com telefone e/ou e-mail.</LinhaArtigo>
      </div>
    ),
  },
  // ── Fase 2 (alarme) ───────────────────────────────────────────────────────
  {
    id: "f2-visao-geral",
    Icon: Bell,
    titulo: "Fase 2 · Alarme: como funciona",
    resumo: "Instalação dos dispositivos do sistema de alarme.",
    conteudo: (
      <div className="space-y-3">
        <p>A Fase 2 acompanha a <strong>instalação do sistema de alarme de incêndio</strong> nas 4 centrais. O fluxo é:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>A equipe de alarme envia, pelo WhatsApp, o <strong>RDO</strong> e as <strong>fotos dos dispositivos</strong> (veja a aba "Para inspetores" → Fase 2).</li>
          <li>Cada dispositivo fotografado passa a <strong>instalado</strong> e aparece no <strong>registro fotográfico</strong>.</li>
          <li>O painel mostra o <strong>progresso</strong> por central e laço, e as <strong>lacunas</strong> do projeto (o que falta cadastrar).</li>
          <li>Os <strong>RDOs</strong> ficam listados, com PDF, prévia, fotos e envio aos destinatários.</li>
        </ol>
        <Nota>Tudo da Fase 2 fica no menu lateral, na seção <strong>Fase 2 · Alarme de incêndio</strong> (Progresso, Registro fotográfico, RDOs).</Nota>
      </div>
    ),
  },
  {
    id: "f2-progresso",
    Icon: Activity,
    titulo: "Progresso da instalação",
    resumo: "Andamento por central e laço, e lacunas do projeto.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={Activity}>Veja o andamento geral e <strong>por central e laço</strong>: quantos dispositivos estão pendente / instalado / endereçado / testado.</LinhaArtigo>
        <LinhaArtigo Icon={AlertTriangle}>As <strong>lacunas do projeto</strong> mostram, por tipo (detector, acionador, sirene…), quanto já foi cadastrado e quanto falta.</LinhaArtigo>
        <LinhaArtigo Icon={Search}>Use a <strong>busca</strong> com filtros (central, tipo, setor, status) e <strong>exporte</strong> em PDF ou CSV.</LinhaArtigo>
        <Nota>Enquanto o mapeamento de endereços, módulos e isoladores não terminar, eles aparecem como <strong>pendentes</strong> — é o esperado.</Nota>
      </div>
    ),
  },
  {
    id: "f2-fotos",
    Icon: ImageIcon,
    titulo: "Registro fotográfico dos dispositivos",
    resumo: "Galeria por data, adicionar e remover fotos.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={CalendarDays}>Em <strong>Registro fotográfico → Por data</strong>, escolha o dia para ver os dispositivos instalados/fotografados.</LinhaArtigo>
        <LinhaArtigo Icon={Camera}>Clique num dispositivo para abrir a <strong>galeria</strong>. Lá você pode <strong>Adicionar fotos</strong> manualmente e <strong>remover</strong> qualquer foto.</LinhaArtigo>
        <LinhaArtigo Icon={ImageIcon}>Fotos enviadas pelo WhatsApp sem identificar o dispositivo ficam na <strong>revisão</strong> para serem atribuídas.</LinhaArtigo>
        <Nota>A aba <strong>Armazenamento</strong> mostra quanto espaço as fotos ocupam (nada é apagado automaticamente).</Nota>
      </div>
    ),
  },
  {
    id: "f2-rdos",
    Icon: FileText,
    titulo: "RDOs: prévia, fotos, PDF, envio e exclusão",
    resumo: "Gerenciar os relatórios diários de obra.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={FileText}>Em <strong>RDOs</strong>, cada relatório tem: <strong>Prévia</strong> (PDF na tela), <strong>Fotos</strong> (adicionar/remover as fotos do dia), <strong>PDF</strong> (baixar) e <strong>Enviar</strong>.</LinhaArtigo>
        <LinhaArtigo Icon={Send}><strong>Enviar</strong> manda o PDF aos destinatários da unidade <Inline>RDO</Inline> (cadastre-os em Destinatários) por WhatsApp e/ou e-mail.</LinhaArtigo>
        <LinhaArtigo Icon={CheckCircle2}><strong>Excluir</strong> remove o RDO das listas (mantido no histórico para auditoria).</LinhaArtigo>
        <Nota>A prévia é leve (sem fotos) para abrir rápido; o botão <strong>PDF</strong> baixa a versão completa com as fotos.</Nota>
      </div>
    ),
  },
  {
    id: "f2-permissoes",
    Icon: ShieldCheck,
    titulo: "Permissões por fase (Fase 1 / Fase 2 / Fase 3)",
    resumo: "Quem pode trabalhar em cada fase.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={ShieldCheck}>Na página <strong>Inspetores</strong>, cada pessoa recebe permissão de <strong>Fase 1</strong> (extintores), <strong>Fase 2</strong> (alarme) e/ou <strong>Fase 3</strong> (hidrantes).</LinhaArtigo>
        <LinhaArtigo Icon={Users}>Use para a troca <strong>instalação → gestão</strong>: ao fim da obra, tire a Fase 2 da equipe instaladora e dê para a equipe de gestão.</LinhaArtigo>
        <Nota>Cada fase tem seus próprios comandos de início/fim no WhatsApp, então um inspetor de uma fase nunca dispara a outra — sem gasto de recursos à toa.</Nota>
      </div>
    ),
  },
  // ── Fase 3 (hidrantes) ────────────────────────────────────────────────────
  {
    id: "f3-visao-geral",
    Icon: Droplets,
    titulo: "Fase 3 · Hidrantes: como funciona",
    resumo: "Inspeção mensal dos hidrantes, igual à Fase 1.",
    conteudo: (
      <div className="space-y-3">
        <p>A Fase 3 funciona como a Fase 1, mas para <strong>hidrantes</strong>:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>O <strong>inspetor</strong> envia as fotos de cada hidrante pelo WhatsApp (veja a aba "Para inspetores" → Fase 3).</li>
          <li>A <strong>IA</strong> lê as fotos e preenche o checklist do hidrante (Esguicho, Mangueira, Chave Storz, etc.).</li>
          <li>O hidrante passa a aguardar <strong>verificação humana</strong>.</li>
          <li>O usuário revisa, corrige se necessário, e marca como <strong>verificado</strong>.</li>
          <li>Gera-se a <strong>ficha de hidrantes</strong> por unidade, e inicia-se um novo ciclo a cada mês.</li>
        </ol>
        <Nota>Tudo da Fase 3 fica no menu lateral, na seção <strong>Fase 3 · Hidrantes</strong>.</Nota>
      </div>
    ),
  },
  {
    id: "f3-unidades",
    Icon: Droplets,
    titulo: "Hidrantes: unidades, inventário e ficha",
    resumo: "Cadastrar unidades, navegar e gerar a ficha.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={MapPin}>Na página <strong>Hidrantes</strong>, o proprietário cadastra as <strong>unidades</strong> (nome + quantidade de hidrantes) e clica em <strong>Gerar inventário</strong> para criar os hidrantes (H01, H02…).</LinhaArtigo>
        <LinhaArtigo Icon={Droplets}>Clique numa <strong>unidade</strong> para ver seus hidrantes; clique num <strong>hidrante</strong> para o detalhe: checklist, fotos e verificação.</LinhaArtigo>
        <LinhaArtigo Icon={CheckCircle2}>No detalhe, use <strong>"Editar valores"</strong> para corrigir o checklist e <strong>"Verificação concluída"</strong> para confirmar.</LinhaArtigo>
        <LinhaArtigo Icon={FileText}>A <strong>ficha de hidrantes</strong> por unidade pode ser pré-visualizada e baixada em PDF, no formato oficial (OK / RUIM / PENDENTE / ENCAMINHAR MANUTENÇÃO).</LinhaArtigo>
        <Nota tipo="alerta">O <strong>novo mês</strong> redefine todos os hidrantes da unidade — gere as fichas <strong>antes</strong> de iniciar o novo ciclo.</Nota>
      </div>
    ),
  },
  {
    id: "configuracoes",
    Icon: Settings,
    titulo: "Configurações e Equipe (proprietário)",
    resumo: "Chaves de API e gestão de acesso.",
    conteudo: (
      <div className="space-y-2">
        <LinhaArtigo Icon={Settings}><strong>Configurações</strong> — chaves de API e segredos (OpenAI, Z-API), criptografados; só o proprietário acessa.</LinhaArtigo>
        <LinhaArtigo Icon={Users}><strong>Equipe</strong> — convide membros, remova acessos e transfira a propriedade.</LinhaArtigo>
      </div>
    ),
  },
];

function GuiaUsuarios() {
  const [aberto, setAberto] = useState<string | null>(ARTIGOS[0].id);
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 leading-relaxed">
        Artigos sobre o uso do painel — clique para expandir.
      </p>
      {ARTIGOS.map((a) => {
        const open = aberto === a.id;
        return (
          <div key={a.id} className={`card overflow-hidden transition-shadow ${open ? "shadow-card-hover" : ""}`}>
            <button
              onClick={() => setAberto(open ? null : a.id)}
              className="w-full flex items-center gap-3.5 px-5 py-4 text-left hover:bg-gray-50/70 transition-colors"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                open ? "bg-brand-50" : "bg-gray-100"
              }`}>
                <a.Icon className={`w-4 h-4 ${open ? "text-brand-600" : "text-gray-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{a.titulo}</p>
                <p className="text-xs text-gray-400 truncate">{a.resumo}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="px-5 pb-5 text-sm text-gray-700 leading-relaxed border-t border-gray-100">
                <div className="pt-4 pl-[3.125rem]">{a.conteudo}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Presentational helpers (consistent with the site's design system) ─────────

function PassoCard({ n, Icon, titulo, children }: { n: number; Icon: typeof MapPin; titulo: string; children: React.ReactNode }) {
  return (
    <div className="card-hover p-5">
      <div className="flex items-center gap-3 mb-3.5">
        <div className="relative w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-brand-600" />
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">{n}</span>
        </div>
        <p className="font-semibold text-gray-900">{titulo}</p>
      </div>
      <div className="text-sm text-gray-600 leading-relaxed pl-[3.25rem]">{children}</div>
    </div>
  );
}

// A command the inspector types — shown as a chat-style bubble, not a black box.
function Comando({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-brand-600 text-white px-4 py-2 text-sm font-semibold shadow-sm">
      <Send className="w-3.5 h-3.5 opacity-80" />
      {children}
    </div>
  );
}

// Inline command reference inside running text.
function Inline({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset ring-brand-600/15">{children}</span>;
}

function Nota({ children, tipo = "info" }: { children: React.ReactNode; tipo?: "info" | "alerta" }) {
  const alerta = tipo === "alerta";
  const Icon = alerta ? AlertTriangle : Info;
  // Info notes use a calm blue (not brand red — red read as an error). Alerts use
  // amber. Both have explicit dark variants so they harmonise on the dark theme.
  return (
    <div className={`mt-3.5 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
      alerta
        ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200"
        : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-200"
    }`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${alerta ? "text-amber-500" : "text-blue-500 dark:text-blue-400"}`} />
      <span>{children}</span>
    </div>
  );
}

function Linha({ Icon, cmd, desc, cor, plain }: { Icon: typeof MapPin; cmd: string; desc: string; cor: string; plain?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <Icon className={`w-4 h-4 shrink-0 ${cor}`} />
      {plain
        ? <span className="text-sm text-gray-600">{cmd}</span>
        : <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-800">{cmd}</span>}
      <span className="text-xs text-gray-400">— {desc}</span>
    </li>
  );
}

function Regra({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2 className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function LinhaArtigo({ Icon, children }: { Icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
