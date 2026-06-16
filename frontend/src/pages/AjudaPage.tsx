import { useState } from "react";
import {
  HelpCircle, Smartphone, LayoutDashboard, ChevronDown,
  MapPin, Camera, CheckCircle2, MessageSquare, ShieldCheck, Clock, Circle,
  FileText, Eye, Send, Users, CalendarDays, Flame, Search, Settings, AlertTriangle,
} from "lucide-react";

type Aba = "inspetores" | "usuarios";

export function AjudaPage() {
  const [aba, setAba] = useState<Aba>("inspetores");

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <HelpCircle className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="page-title">Central de Ajuda</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Guias de uso do sistema — para inspetores em campo e para usuários do painel.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setAba("inspetores")}
          className={aba === "inspetores" ? "btn-primary" : "btn-secondary"}
        >
          <Smartphone className="w-4 h-4" /> Para inspetores (WhatsApp)
        </button>
        <button
          onClick={() => setAba("usuarios")}
          className={aba === "usuarios" ? "btn-primary" : "btn-secondary"}
        >
          <LayoutDashboard className="w-4 h-4" /> Para usuários (painel)
        </button>
      </div>

      {aba === "inspetores" ? <GuiaInspetores /> : <GuiaUsuarios />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INSPECTOR GUIDE (WhatsApp flow)
// ════════════════════════════════════════════════════════════════════════════

const REGIOES = ["Barry Itabuna", "Ilhéus", "CW Itabuna", "CW Ilhéus", "Viveiro Itabuna", "Viveiro Ilhéus"];

function GuiaInspetores() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 leading-relaxed">
        Os inspetores enviam as fotos dos extintores diretamente pelo <strong>WhatsApp</strong>.
        O sistema lê as fotos com inteligência artificial e registra cada extintor automaticamente.
        Siga os passos abaixo.
      </p>

      {/* Step 0 — start session */}
      <PassoCard n={1} Icon={MessageSquare} titulo="Inicie a sessão de trabalho">
        <p>Antes de tudo, envie a mensagem para <strong>ativar a sua sessão</strong>:</p>
        <CodeBlock>Iniciar</CodeBlock>
        <p className="mt-2">A partir daí, suas fotos passam a ser analisadas. <strong>Enquanto a sessão não estiver iniciada, as fotos são ignoradas</strong> (isso evita gastar recursos com fotos que não são de extintores).</p>
        <Nota>A sessão continua aberta por <strong>vários extintores e regiões</strong> — você só inicia uma vez. Ela fecha quando você enviar <code className="code">Encerrar</code> (ou sozinha após 3 horas sem nenhuma mensagem).</Nota>
      </PassoCard>

      {/* Step 1 — region */}
      <PassoCard n={2} Icon={MapPin} titulo="Informe a região">
        <p>Antes de fotografar, envie o <strong>nome da região</strong> onde você está:</p>
        <CodeBlock>Barry Itabuna</CodeBlock>
        <p className="mt-2">Regiões válidas (digite exatamente assim):</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {REGIOES.map((r) => <span key={r} className="badge-brand">{r}</span>)}
        </div>
        <Nota>Você só precisa enviar a região <strong>uma vez</strong>. Todos os extintores seguintes ficam nessa região, até você trocar.</Nota>
      </PassoCard>

      {/* Step 3 */}
      <PassoCard n={3} Icon={Camera} titulo="Fotografe cada extintor (4 a 6 fotos)">
        <p>
          Para <strong>cada extintor</strong>, selecione de <strong>4 a 6 fotos juntas</strong> na galeria e
          envie como <strong>um único álbum</strong>.
        </p>
        <p className="mt-2">As fotos devem cobrir todas as informações:</p>
        <ul className="mt-1.5 space-y-1.5">
          <ItemFoto destaque>📋 A etiqueta/selo com as datas de vencimento — foto nítida e de perto</ItemFoto>
          <ItemFoto>🔘 O manômetro (o ponteiro de pressão)</ItemFoto>
          <ItemFoto>🧯 O extintor inteiro na parede (suporte, mangueira, sinalização)</ItemFoto>
          <ItemFoto>⬇️ O piso / localização (sinalização de piso)</ItemFoto>
        </ul>
        <Nota tipo="alerta">
          A foto da etiqueta precisa estar <strong>focada e bem iluminada</strong> — senão o sistema não
          consegue ler as datas de vencimento.
        </Nota>
      </PassoCard>

      {/* Step 4 — number */}
      <PassoCard n={4} Icon={CheckCircle2} titulo="Logo após o álbum, envie o NÚMERO do extintor">
        <p>Depois de enviar o álbum, mande o <strong>número do extintor</strong> (o da etiqueta amarela) como uma mensagem de texto:</p>
        <CodeBlock>18</CodeBlock>
        <p className="mt-2">O número <strong>fecha aquele extintor</strong> e a IA analisa o álbum. <strong>A sessão continua aberta</strong> — siga para o próximo: novo álbum, depois o novo número.</p>
        <Nota>Não é preciso enviar "Fim". O próprio número é o sinal de que o extintor terminou.</Nota>
      </PassoCard>

      {/* Step 5 — end session */}
      <PassoCard n={5} Icon={MessageSquare} titulo="Encerre a sessão ao final do trabalho">
        <p>Quando terminar <strong>todo o trabalho</strong> (todos os extintores, em todas as regiões), envie:</p>
        <CodeBlock>Encerrar</CodeBlock>
        <p className="mt-2">Isso fecha a sessão. A partir daí, fotos enviadas <strong>não são mais processadas</strong> até você enviar <code className="code">Iniciar</code> novamente.</p>
      </PassoCard>

      {/* Example */}
      <div className="card p-5">
        <p className="section-title mb-3">Exemplo completo de uma sessão</p>
        <div className="rounded-lg bg-gray-900 text-gray-100 text-sm font-mono p-4 space-y-1.5 leading-relaxed">
          <div><span className="text-sky-400">Iniciar</span>               <span className="text-gray-500"># abre a sessão</span></div>
          <div><span className="text-emerald-400">Barry Itabuna</span>         <span className="text-gray-500"># informa a região</span></div>
          <div>[álbum de 4 fotos]  <span className="text-gray-500"># extintor 58</span></div>
          <div><span className="text-amber-400">58</span>                    <span className="text-gray-500"># número → conclui o extintor 58</span></div>
          <div>[álbum de 4 fotos]  <span className="text-gray-500"># extintor 59</span></div>
          <div><span className="text-amber-400">59</span>                    <span className="text-gray-500"># número → conclui o extintor 59</span></div>
          <div><span className="text-emerald-400">Ilhéus</span>                <span className="text-gray-500"># troca de região</span></div>
          <div>[álbum de 5 fotos]  <span className="text-gray-500"># extintor 12</span></div>
          <div><span className="text-amber-400">12</span>                    <span className="text-gray-500"># número → conclui o extintor 12</span></div>
          <div><span className="text-rose-400">Encerrar</span>              <span className="text-gray-500"># fecha a sessão (fim do trabalho)</span></div>
        </div>
      </div>

      {/* Rules */}
      <div className="card p-5 border-amber-200 bg-amber-50/40">
        <p className="section-title mb-3 flex items-center gap-1.5 text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" /> Regras importantes
        </p>
        <ul className="space-y-2 text-sm text-gray-700">
          <Regra>Sempre envie <code className="code">Iniciar</code> <strong>antes</strong> de mandar fotos — fora da sessão, as fotos são ignoradas.</Regra>
          <Regra>A ordem por extintor é: <strong>álbum de fotos → número</strong>. O número fecha o extintor; <strong>não use "Fim"</strong>.</Regra>
          <Regra>Envie as fotos como <strong>um álbum</strong> (selecione todas juntas na galeria) pelo <strong>chat direto</strong> — não em grupo, não como "documento/arquivo".</Regra>
          <Regra>O <strong>número</strong> deve ser o da <strong>etiqueta amarela</strong> do extintor.</Regra>
          <Regra>Só números <strong>cadastrados</strong> na região funcionam (ex.: Barry Itabuna vai de 1 a 276).</Regra>
          <Regra>Para <strong>trocar de região</strong>, envie o novo nome da região e continue.</Regra>
          <Regra>No final de tudo, envie <code className="code">Encerrar</code>. Seu número precisa estar <strong>cadastrado como inspetor</strong>.</Regra>
        </ul>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// USER GUIDE (dashboard) — systematic articles in an accordion
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
      <div className="space-y-3">
        <p>A página <strong>Extintores</strong> mostra as 6 regiões com o progresso de cada uma.</p>
        <ul className="space-y-2">
          <li className="flex gap-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span>Clique numa <strong>região</strong> para ver todos os seus extintores em tabela (Nº, setor, tipo, vencimentos, situação, verificação).</span></li>
          <li className="flex gap-2"><Search className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span>Use a <strong>busca</strong> e os <strong>filtros de status</strong> (Todos / Aguardando / Verificados / Não inspecionados) para encontrar extintores.</span></li>
          <li className="flex gap-2"><FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span>Clique num <strong>extintor</strong> para ver o detalhe completo: identificação, checklist, fotos e histórico.</span></li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span>No detalhe, use <strong>"Editar valores"</strong> para corrigir qualquer dado, e <strong>"Verificação concluída"</strong> para confirmar.</span></li>
        </ul>
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
          <div className="flex items-center gap-2"><span className="badge-green"><ShieldCheck className="w-3 h-3" /> Verificado</span> <span className="text-sm text-gray-600">— um usuário revisou e confirmou os dados.</span></div>
        </div>
        <Nota>Se novas fotos chegarem para um extintor já verificado, ele volta para <strong>"Aguardando verificação"</strong> — os dados novos sempre precisam de nova conferência.</Nota>
      </div>
    ),
  },
  {
    id: "verificacao",
    Icon: CheckCircle2,
    titulo: "Como fazer a verificação humana",
    resumo: "Revisar o que a IA registrou e confirmar.",
    conteudo: (
      <div className="space-y-3">
        <p>A IA é um apoio — a conferência final é sua. Para cada extintor "Aguardando verificação":</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Abra o extintor e <strong>compare os dados</strong> (datas, checklist) com as fotos.</li>
          <li>Se algo estiver errado, clique em <strong>"Editar valores"</strong> e corrija.</li>
          <li>Clique em <strong>"Verificação concluída"</strong>. O status vira <span className="badge-green text-[10px]"><ShieldCheck className="w-3 h-3" /> Verificado</span>.</li>
        </ol>
        <Nota>Assim você acompanha quais extintores já conferiu e quais ainda faltam.</Nota>
      </div>
    ),
  },
  {
    id: "relatorios",
    Icon: FileText,
    titulo: "Relatórios: pré-visualizar, baixar e enviar",
    resumo: "Ficha oficial por região, em PDF.",
    conteudo: (
      <div className="space-y-3">
        <p>Há duas páginas para relatórios:</p>
        <ul className="space-y-2">
          <li className="flex gap-2"><FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span><strong>Fichas</strong> — por região: <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Pré-visualizar</span>, Baixar PDF, ou <span className="inline-flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Enviar</span> aos destinatários.</span></li>
          <li className="flex gap-2"><Search className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span><strong>Busca / Relatórios</strong> — relatório por região no formato oficial, além de busca avançada com filtros e exportação.</span></li>
        </ul>
        <Nota>O relatório usa o <strong>formato oficial de ficha</strong> (checklist por extintor, fotos e rodapé de participantes). A pré-visualização abre o PDF na tela antes de baixar ou enviar.</Nota>
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
          <li>O resultado mostra, por destinatário, se cada canal foi entregue (✓) ou falhou (✗).</li>
        </ol>
        <Nota>Cadastre quem recebe na página <strong>Destinatários</strong>. Cada pessoa pode ter telefone, e-mail, ou os dois.</Nota>
      </div>
    ),
  },
  {
    id: "novo-mes",
    Icon: CalendarDays,
    titulo: "Iniciar um novo mês (ciclo de inspeção)",
    resumo: "Arquivar o mês atual e reiniciar.",
    conteudo: (
      <div className="space-y-3">
        <p>Quando a inspeção do mês termina, o <strong>proprietário</strong> inicia o próximo ciclo:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Página <strong>Extintores</strong> → botão <strong>"Iniciar novo mês"</strong>.</li>
          <li>Informe o mês de referência (ex.: <code className="code">Julho/2026</code>).</li>
          <li>Todos os extintores voltam a <strong>"Não inspecionado"</strong>; o mês anterior fica arquivado no histórico.</li>
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
      <div className="space-y-3">
        <ul className="space-y-2">
          <li className="flex gap-2"><Smartphone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span><strong>Inspetores</strong> — cadastre o número de WhatsApp (com DDI, ex.: <code className="code">5577999999999</code>) de quem fotografa em campo. Só números ativos aqui podem enviar fotos.</span></li>
          <li className="flex gap-2"><Send className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span><strong>Destinatários</strong> — cadastre quem recebe as fichas por região, com telefone e/ou e-mail.</span></li>
        </ul>
      </div>
    ),
  },
  {
    id: "configuracoes",
    Icon: Settings,
    titulo: "Configurações e Equipe (proprietário)",
    resumo: "Chaves de API e gestão de acesso.",
    conteudo: (
      <div className="space-y-3">
        <ul className="space-y-2">
          <li className="flex gap-2"><Settings className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span><strong>Configurações</strong> — chaves de API e segredos (OpenAI, Z-API). Ficam criptografados; só o proprietário acessa.</span></li>
          <li className="flex gap-2"><Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> <span><strong>Equipe</strong> — convide membros, remova acessos e transfira a propriedade. Membros usam o painel; só o proprietário faz ações sensíveis.</span></li>
        </ul>
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
          <div key={a.id} className="card overflow-hidden">
            <button
              onClick={() => setAberto(open ? null : a.id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50/70 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <a.Icon className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{a.titulo}</p>
                <p className="text-xs text-gray-400 truncate">{a.resumo}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="px-5 pb-5 pt-1 text-sm text-gray-700 leading-relaxed border-t border-gray-100">
                <div className="pt-4">{a.conteudo}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────

function PassoCard({ n, Icon, titulo, children }: { n: number; Icon: typeof MapPin; titulo: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">{n}</div>
        <Icon className="w-4 h-4 text-gray-400" />
        <p className="font-semibold text-gray-900">{titulo}</p>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed pl-11">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-lg bg-gray-900 text-gray-100 font-mono text-sm px-4 py-2.5 w-fit">{children}</div>
  );
}

function Nota({ children, tipo = "info" }: { children: React.ReactNode; tipo?: "info" | "alerta" }) {
  const cls = tipo === "alerta" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-blue-50 border-blue-200 text-blue-800";
  return <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

function ItemFoto({ children, destaque }: { children: React.ReactNode; destaque?: boolean }) {
  return (
    <li className={`flex items-start gap-2 ${destaque ? "font-medium text-gray-900" : "text-gray-700"}`}>
      <span>{children}</span>
    </li>
  );
}

function Regra({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
