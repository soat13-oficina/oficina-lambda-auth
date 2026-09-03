/**
 * Leitura de segredos do AWS Secrets Manager, com cache em memoria.
 *
 * O cache vive no escopo do container da Lambda: um container quente le o
 * segredo uma unica vez. Sem isso, cada invocacao pagaria uma chamada de rede
 * (~30-60 ms) e a conta de Secrets Manager cresceria por requisicao.
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const cliente = new SecretsManagerClient({});
const cache = new Map();

/**
 * @param {string} secretId ARN ou nome do segredo.
 * @returns {Promise<string>} Conteudo bruto do segredo.
 */
export async function lerSegredo(secretId) {
  if (!secretId) throw new Error('secretId ausente');
  if (cache.has(secretId)) return cache.get(secretId);

  const resposta = await cliente.send(new GetSecretValueCommand({ SecretId: secretId }));
  const valor = resposta.SecretString;
  if (!valor) throw new Error(`segredo ${secretId} sem SecretString`);

  cache.set(secretId, valor);
  return valor;
}

/**
 * Le um segredo que guarda JSON (formato do segredo gerenciado pelo RDS:
 * {"username": "...", "password": "..."}).
 *
 * @param {string} secretId ARN ou nome do segredo.
 * @returns {Promise<object>}
 */
export async function lerSegredoJson(secretId) {
  return JSON.parse(await lerSegredo(secretId));
}
