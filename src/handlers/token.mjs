/**
 * POST /auth - emissao de token a partir do CPF.
 *
 * ============================================================================
 * ESTADO: BASE. A consulta do cliente na base de dados ainda NAO foi escrita.
 * Ver a secao "O que falta" no README antes de mexer aqui.
 * ============================================================================
 *
 * O que ja esta pronto neste arquivo:
 *   - contrato de request/response (abaixo), parse e validacao de entrada;
 *   - validacao de CPF por digito verificador (src/lib/cpf.mjs);
 *   - log estruturado com correlacao (src/lib/log.mjs);
 *   - assinatura do JWT HS256 (src/lib/jwt.mjs) e leitura do segredo
 *     no Secrets Manager (src/lib/segredos.mjs).
 *
 * O que falta:
 *   - consultar existencia e status do cliente no PostgreSQL e decidir as
 *     claims do token. Variaveis de ambiente ja injetadas pelo Terraform:
 *     DB_HOST, DB_PORT, DB_NAME, DB_SECRET_ARN.
 *
 * Contrato:
 *   Request   POST /auth   { "cpf": "529.982.247-25" }
 *   200 OK    { "token": "<jwt>", "expiraEm": 3600, "tipo": "Bearer" }
 *   400       { "codigo": "CPF_INVALIDO",   "mensagem": "..." }
 *   404       { "codigo": "CLIENTE_NAO_ENCONTRADO", "mensagem": "..." }
 *   403       { "codigo": "CLIENTE_INATIVO", "mensagem": "..." }
 *   500       { "codigo": "ERRO_INTERNO",   "mensagem": "..." }
 */
import { cpfValido, normalizarCpf, cpfParaLog } from '../lib/cpf.mjs';
import { log, idDaRequisicao } from '../lib/log.mjs';

const TTL_PADRAO_SEGUNDOS = Number(process.env.TOKEN_TTL_SECONDS ?? 3600);

function resposta(statusCode, corpo, requestId) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      // Devolvido ao chamador para que ele consiga correlacionar o proprio
      // log com o desta funcao ao abrir um chamado.
      'x-request-id': requestId,
    },
    body: JSON.stringify(corpo),
  };
}

export async function handler(evento) {
  const requestId = idDaRequisicao(evento);
  const inicio = Date.now();

  try {
    let corpo;
    try {
      corpo = JSON.parse(evento?.body ?? '{}');
    } catch {
      log.warn('corpo da requisicao nao e JSON valido', { requestId });
      return resposta(400, { codigo: 'CPF_INVALIDO', mensagem: 'Corpo da requisicao invalido.' }, requestId);
    }

    const cpf = normalizarCpf(corpo?.cpf);

    if (!cpfValido(cpf)) {
      log.warn('CPF reprovado na validacao', { requestId, cpf: cpfParaLog(cpf) });
      return resposta(
        400,
        { codigo: 'CPF_INVALIDO', mensagem: 'CPF invalido.' },
        requestId,
      );
    }

    log.info('CPF valido, consultando cliente', { requestId, cpf: cpfParaLog(cpf) });

    // ------------------------------------------------------------------
    // TODO(auth): consultar o cliente no PostgreSQL e emitir o token.
    //
    //   1. adicione o driver:  npm install pg
    //   2. credenciais:        await lerSegredoJson(process.env.DB_SECRET_ARN)
    //   3. consulta:           SELECT id, nome, ativo FROM cliente WHERE cpf = $1
    //   4. nao encontrado  ->  404 CLIENTE_NAO_ENCONTRADO
    //      inativo         ->  403 CLIENTE_INATIVO
    //   5. encontrado e ativo:
    //        const segredo = await lerSegredo(process.env.JWT_SECRET_ARN);
    //        const token = assinar(
    //          { sub: cpf, clienteId: cliente.id, nome: cliente.nome, roles: ['CLIENTE'] },
    //          segredo,
    //          { expiresInSeconds: TTL_PADRAO_SEGUNDOS },
    //        );
    //        return resposta(200, { token, expiraEm: TTL_PADRAO_SEGUNDOS, tipo: 'Bearer' }, requestId);
    //
    // Antes de ligar isto, mude enable_authorizer para true em
    // infra/variables.tf - so entao as rotas protegidas passam a exigir token.
    // ------------------------------------------------------------------
    log.warn('emissao de token ainda nao implementada', { requestId });
    return resposta(
      501,
      {
        codigo: 'NAO_IMPLEMENTADO',
        mensagem: 'Consulta do cliente e emissao de token ainda nao implementadas.',
      },
      requestId,
    );
  } catch (erro) {
    log.error('falha inesperada na emissao de token', {
      requestId,
      erro: erro.message,
      stack: erro.stack,
    });
    return resposta(500, { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' }, requestId);
  } finally {
    log.info('requisicao concluida', { requestId, duracaoMs: Date.now() - inicio });
  }
}
