/**
 * POST /auth - emissao de token a partir do CPF.
 *
 * Fluxo: valida o CPF por digito verificador, consulta o cliente na base,
 * checa se esta ativo e devolve um JWT que a API em Spring Boot aceita.
 *
 * Contrato:
 *   Request   POST /auth   { "cpf": "529.982.247-25" }
 *   200 OK    { "token": "<jwt>", "expiraEm": 3600, "tipo": "Bearer",
 *               "cliente": { "id": "...", "nome": "..." } }
 *   400       { "codigo": "CPF_INVALIDO",   "mensagem": "..." }
 *   404       { "codigo": "CLIENTE_NAO_ENCONTRADO", "mensagem": "..." }
 *   403       { "codigo": "CLIENTE_INATIVO", "mensagem": "..." }
 *   500       { "codigo": "ERRO_INTERNO",   "mensagem": "..." }
 *
 * Sobre as claims: a aplicacao distingue este token do token de e-mail/senha
 * pela claim "tipo". Quando ela vale CLIENTE, o JwtAuthenticationFilter monta a
 * autenticacao a partir das proprias claims, sem procurar uma linha na tabela
 * "usuarios" - um cliente autenticado por CPF nao e um usuario do sistema.
 * Mudar o nome ou o valor dessa claim quebra o login la.
 */
import { cpfValido, normalizarCpf, cpfParaLog } from '../lib/cpf.mjs';
import { assinar } from '../lib/jwt.mjs';
import { buscarClientePorCpf } from '../lib/banco.mjs';
import { lerSegredo } from '../lib/segredos.mjs';
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

/**
 * Fabrica do handler, com as dependencias externas injetaveis.
 *
 * Existe para que os testes rodem o fluxo inteiro sem banco nem Secrets
 * Manager, em vez de exercitarem so as funcoes auxiliares. A exportacao
 * "handler" abaixo e a que a Lambda usa, ja com as dependencias reais.
 */
export function criarHandler({
  buscarCliente = buscarClientePorCpf,
  obterSegredo = lerSegredo,
  ttlSegundos = TTL_PADRAO_SEGUNDOS,
} = {}) {
  return async function handler(evento) {
    const requestId = idDaRequisicao(evento);
    const inicio = Date.now();

    try {
      let corpo;
      try {
        corpo = JSON.parse(evento?.body ?? '{}');
      } catch {
        log.warn('corpo da requisicao nao e JSON valido', { requestId });
        return resposta(
          400,
          { codigo: 'CPF_INVALIDO', mensagem: 'Corpo da requisicao invalido.' },
          requestId,
        );
      }

      const cpf = normalizarCpf(corpo?.cpf);

      if (!cpfValido(cpf)) {
        log.warn('CPF reprovado na validacao', { requestId, cpf: cpfParaLog(cpf) });
        return resposta(400, { codigo: 'CPF_INVALIDO', mensagem: 'CPF invalido.' }, requestId);
      }

      const cliente = await buscarCliente(cpf);

      if (!cliente) {
        // Mesma mensagem generica para nao encontrado e inativo seria mais
        // discreta, mas o enunciado pede distinguir existencia de status - e o
        // cliente precisa saber qual dos dois resolver.
        log.warn('cliente nao encontrado', { requestId, cpf: cpfParaLog(cpf) });
        return resposta(
          404,
          { codigo: 'CLIENTE_NAO_ENCONTRADO', mensagem: 'Cliente nao encontrado.' },
          requestId,
        );
      }

      if (!cliente.ativo) {
        log.warn('cliente inativo', { requestId, clienteId: cliente.id });
        return resposta(
          403,
          { codigo: 'CLIENTE_INATIVO', mensagem: 'Cliente inativo.' },
          requestId,
        );
      }

      const segredo = await obterSegredo(process.env.JWT_SECRET_ARN);

      const token = assinar(
        {
          sub: cpf,
          tipo: 'CLIENTE',
          clienteId: cliente.id,
          nome: cliente.nome,
          roles: ['CLIENTE'],
        },
        segredo,
        { expiresInSeconds: ttlSegundos },
      );

      log.info('token emitido', { requestId, clienteId: cliente.id });

      return resposta(
        200,
        {
          token,
          expiraEm: ttlSegundos,
          tipo: 'Bearer',
          cliente: { id: cliente.id, nome: cliente.nome },
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
  };
}

export const handler = criarHandler();
