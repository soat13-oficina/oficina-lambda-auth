/**
 * Consulta do cliente pelo CPF no OS Service, por HTTP.
 *
 * O OS e o dono do cadastro de clientes (ADR 0003 do oficina-app): a Lambda nao le mais o banco dele.
 * A chamada vai ao ALB do ambiente (URL no SSM /oficina/<env>/alb-url, lida pelo Terraform e entregue em
 * OS_BASE_URL) com o header X-Service-Token - o ALB so encaminha /internal/clientes/* quando o header vem;
 * quem confere o valor e o OS. Contrato: docs/contratos/rest-interno.md do oficina-app.
 *
 * Tudo que nao e "achei" ou "nao existe" vira excecao: o handler responde 500 em vez de dizer ao cliente
 * que o CPF nao esta cadastrado quando, na verdade, o OS esta fora do ar ou recusou o token.
 */
import { lerSegredo } from './segredos.mjs';

const TIMEOUT_PADRAO_MS = 3000;

/**
 * @param {string} cpf CPF somente digitos.
 * @param {object} [opcoes]
 * @param {string} [opcoes.requestId] Propagado no header x-request-id (correlacao de logs).
 * @param {typeof fetch} [opcoes.fetchFn] Injetavel nos testes.
 * @param {(secretId: string) => Promise<string>} [opcoes.obterSegredo] Injetavel nos testes.
 * @param {string} [opcoes.baseUrl] Default: OS_BASE_URL.
 * @param {string} [opcoes.serviceTokenArn] Default: SERVICE_TOKEN_ARN.
 * @param {number} [opcoes.timeoutMs] Default: 3 s.
 * @returns {Promise<{id: string, nome: string, ativo: boolean} | null>}
 *   O cliente, ou null se nao existir.
 */
export async function buscarClientePorCpf(cpf, opcoes = {}) {
  const {
    requestId,
    fetchFn = fetch,
    obterSegredo = lerSegredo,
    baseUrl = process.env.OS_BASE_URL,
    serviceTokenArn = process.env.SERVICE_TOKEN_ARN,
    timeoutMs = TIMEOUT_PADRAO_MS,
  } = opcoes;

  if (!baseUrl) throw new Error('OS_BASE_URL nao configurada');

  const serviceToken = await obterSegredo(serviceTokenArn);

  const resposta = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/internal/clientes/por-cpf/${cpf}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-service-token': serviceToken,
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (resposta.status === 404) return null;
  // Mensagem sem a URL: ela carrega o CPF e o erro vai para o log.
  if (!resposta.ok) throw new Error(`OS Service respondeu HTTP ${resposta.status} na consulta de cliente`);

  const cliente = await resposta.json();

  return {
    id: String(cliente.id),
    nome: cliente.nome,
    // Comparacao explicita com false: um campo ausente nao deve ser lido como inativo.
    ativo: cliente.ativo !== false,
  };
}
