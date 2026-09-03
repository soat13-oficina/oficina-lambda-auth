/**
 * Lambda Authorizer do API Gateway (payload format 2.0, simple response).
 *
 * Protege as rotas sensiveis da aplicacao: valida o JWT emitido por
 * handlers/token.mjs antes que a requisicao chegue ao cluster.
 *
 * Por que um Lambda Authorizer e nao o JWT Authorizer nativo do API Gateway:
 * o nativo so aceita emissores OIDC com JWKS publicado (RS256). Como o token e
 * HS256 com segredo compartilhado com a API em Spring Boot, a validacao precisa
 * acontecer em codigo. Ver docs/adr/0001-api-gateway-e-autorizacao.md.
 *
 * Este handler esta COMPLETO - so passa a ser exercitado quando
 * enable_authorizer virar true em infra/variables.tf, o que depende da emissao
 * de token estar implementada.
 */
import { verificar } from '../lib/jwt.mjs';
import { lerSegredo } from '../lib/segredos.mjs';
import { log, idDaRequisicao } from '../lib/log.mjs';

const NEGADO = { isAuthorized: false };

function extrairToken(evento) {
  // Headers do payload 2.0 chegam sempre em minusculas.
  const cabecalho = evento?.headers?.authorization ?? evento?.headers?.Authorization ?? '';
  const [esquema, valor] = String(cabecalho).split(' ');

  if (!valor || esquema.toLowerCase() !== 'bearer') return null;
  return valor;
}

export async function handler(evento) {
  const requestId = idDaRequisicao(evento);

  const token = extrairToken(evento);
  if (!token) {
    log.warn('requisicao sem header Authorization Bearer', { requestId });
    return NEGADO;
  }

  try {
    const segredo = await lerSegredo(process.env.JWT_SECRET_ARN);
    const claims = verificar(token, segredo);

    log.info('token aceito', { requestId, sub: claims.sub });

    return {
      isAuthorized: true,
      // Repassado a aplicacao no requestContext - permite a API saber quem e o
      // chamador sem reabrir o token.
      context: {
        sub: String(claims.sub ?? ''),
        clienteId: String(claims.clienteId ?? ''),
        roles: Array.isArray(claims.roles) ? claims.roles.join(',') : '',
        requestId,
      },
    };
  } catch (erro) {
    // Motivo so no log: devolver "assinatura invalida" x "token expirado" ao
    // chamador entrega informacao util a quem estiver sondando a API.
    log.warn('token recusado', { requestId, motivo: erro.message });
    return NEGADO;
  }
}
