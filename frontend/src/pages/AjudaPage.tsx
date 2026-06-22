import { useState } from "react";
import {
  HelpCircle, Smartphone, LayoutDashboard, ChevronDown, MapPin, Camera,
  CheckCircle2, PlayCircle, StopCircle, ShieldCheck, Clock, Circle, FileText,
  Send, Users, CalendarDays, Flame, Search, Settings, AlertTriangle,
  Hash, Tag, Gauge, SignpostBig, Info,
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

function GuiaInspetores() {
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
