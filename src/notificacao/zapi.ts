import { logger } from "../logger";

// Z-API docs: POST https://api.z-api.io/instances/{instanceId}/token/{token}/send-text
// Headers: Client-Token: <clientToken>

const MAX_TENTATIVAS = 3;
const BACKOFF_MS = [1_000, 3_000, 7_000]; // 1s, 3s, 7s

function getConfig(): { instanceId: string; token: string; clientToken: string } {
  const instanceId   = process.env.ZAPI_INSTANCE_ID;
  const token        = process.env.ZAPI_TOKEN;
  const clientToken  = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !token || !clientToken) {
    throw new Error(
      "Variáveis de ambiente Z-API não configuradas: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN"
    );
  }
  return { instanceId, token, clientToken };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns true if the HTTP status warrants a retry (server-side transient errors).
function deveRetentar(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Sends a WhatsApp text message via Z-API.
 * Retries up to MAX_TENTATIVAS on transient failures.
 * Never throws — logs "falha ao enviar confirmação" and returns false on ultimate failure.
 */
export async function sendWhatsAppMessage(phone: string, text: string): Promise<boolean> {
  const log = logger.child({ modulo: "zapi", phone });

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (err: any) {
    log.error({ err: err.message }, "falha ao enviar confirmação — configuração Z-API ausente");
    return false;
  }

  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-text`;
  const body = JSON.stringify({ phone, message: text });

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": config.clientToken,
        },
        body,
      });

      if (response.ok) {
        log.info({ tentativa }, "confirmação WhatsApp enviada");
        return true;
      }

      if (!deveRetentar(response.status)) {
        // 4xx client error — retrying won't help
        const detalhe = await response.text().catch(() => "");
        log.error(
          { status: response.status, detalhe, tentativa },
          "falha ao enviar confirmação — erro do cliente Z-API"
        );
        return false;
      }

      log.warn({ status: response.status, tentativa }, "Z-API retornou erro transitório — aguardando retry");
    } catch (err: any) {
      log.warn({ err: err.message, tentativa }, "Z-API inacessível — aguardando retry");
    }

    if (tentativa < MAX_TENTATIVAS) {
      await sleep(BACKOFF_MS[tentativa - 1] ?? 7_000);
    }
  }

  log.error({ phone, maxTentativas: MAX_TENTATIVAS }, "falha ao enviar confirmação — todas as tentativas esgotadas");
  return false;
}
