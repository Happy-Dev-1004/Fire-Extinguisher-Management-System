import { logger } from "../logger";
import { getSecret } from "../segredos/getSecret";
import type { DestinatarioResolvido } from "../destinatarios/resolver";

const log = logger.child({ modulo: "notificacao/enviarFicha" });

const MAX_TENTATIVAS = 3;
const BACKOFF_MS = [1_000, 3_000, 7_000];

async function getConfig(): Promise<{ instanceId: string; token: string; clientToken: string }> {
  const [instanceId, token, clientToken] = await Promise.all([
    getSecret("ZAPI_INSTANCE_ID"),
    getSecret("ZAPI_TOKEN"),
    getSecret("ZAPI_CLIENT_TOKEN"),
  ]);
  return { instanceId, token, clientToken };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ResultadoEnvio {
  destinatario: { id: string; nome: string; telefone: string };
  ok: boolean;
  motivo?: string;
}

export interface EnviarFichaInput {
  unidade:       string;
  mes:           string;
  pdfBuffer:     Buffer;
  destinatarios: DestinatarioResolvido[];
}

export async function enviarFichaWhatsApp(input: EnviarFichaInput): Promise<ResultadoEnvio[]> {
  let config: Awaited<ReturnType<typeof getConfig>>;
  try {
    config = await getConfig();
  } catch (err: any) {
    log.error({ err: err.message }, "configuração Z-API ausente — envio de ficha cancelado");
    return input.destinatarios.map((d) => ({
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone },
      ok: false,
      motivo: "Configuração Z-API ausente.",
    }));
  }

  // Z-API's send-document endpoint requires the document as a data-URI
  // (data:<mime>;base64,<payload>), NOT a bare base64 string. Sending raw
  // base64 fails with "Base64/Url could not be read". The path extension must
  // match the file type too (.../send-document/pdf).
  const base64Pdf = `data:application/pdf;base64,${input.pdfBuffer.toString("base64")}`;
  const caption   = `Ficha de inspeção de extintores — ${input.unidade} — ${input.mes}`;
  const fileName  = `ficha_${input.unidade.replace(/\s+/g, "_")}_${input.mes.replace("/", "-")}.pdf`;
  const url       = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-document/pdf`;

  log.info(
    { unidade: input.unidade, mes: input.mes, qtdDestinatarios: input.destinatarios.length },
    "ficha gerada — iniciando envio WhatsApp"
  );

  const resultados: ResultadoEnvio[] = [];

  for (const dest of input.destinatarios) {
    const destLog = log.child({ destinatarioId: dest.id, nome: dest.nome, telefone: dest.telefone });
    let ok = false;
    let motivo: string | undefined;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": config.clientToken,
          },
          body: JSON.stringify({
            phone:    dest.telefone_normalizado,
            document: base64Pdf,
            fileName,
            caption,
          }),
        });

        if (response.ok) {
          destLog.info({ tentativa }, "ficha enviada com sucesso");
          ok = true;
          break;
        }

        const status  = response.status;
        const detalhe = await response.text().catch(() => "");

        if (status < 500 && status !== 429) {
          motivo = `Z-API erro ${status}: ${detalhe}`;
          destLog.error({ status, detalhe, tentativa }, "falha ao enviar ficha — erro do cliente");
          break;
        }

        destLog.warn({ status, tentativa }, "Z-API erro transitório — aguardando retry");
      } catch (err: any) {
        destLog.warn({ err: err.message, tentativa }, "Z-API inacessível — aguardando retry");
        motivo = err.message;
      }

      if (tentativa < MAX_TENTATIVAS) {
        await sleep(BACKOFF_MS[tentativa - 1] ?? 7_000);
      }
    }

    if (!ok && !motivo) motivo = "Todas as tentativas esgotadas.";

    resultados.push({
      destinatario: { id: dest.id, nome: dest.nome, telefone: dest.telefone },
      ok,
      motivo,
    });
  }

  const enviados = resultados.filter((r) => r.ok).length;
  const falhas   = resultados.filter((r) => !r.ok).length;
  log.info(
    { unidade: input.unidade, mes: input.mes, enviados, falhas },
    "ficha enviada"
  );

  return resultados;
}
