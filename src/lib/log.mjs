/**
 * Log estruturado em JSON com correlacao entre requisicoes.
 *
 * Atende ao requisito de observabilidade do desafio: uma linha por evento, em
 * JSON, sempre carregando o requestId do API Gateway. Esse mesmo id chega a
 * aplicacao pelo header X-Request-Id, o que permite seguir uma requisicao do
 * gateway ate o banco em uma unica busca no CloudWatch/Datadog.
 *
 * NUNCA registre CPF, token ou senha aqui - use cpfParaLog() para o documento.
 */

function emitir(nivel, mensagem, contexto = {}) {
  const linha = {
    timestamp: new Date().toISOString(),
    level: nivel,
    service: 'oficina-lambda-auth',
    env: process.env.AMBIENTE ?? 'desconhecido',
    message: mensagem,
    ...contexto,
  };

  // console.log escreve uma linha por chamada no CloudWatch Logs; o JSON
  // precisa caber nela, por isso nada de pretty-print.
  console.log(JSON.stringify(linha));
}

export const log = {
  info: (mensagem, contexto) => emitir('INFO', mensagem, contexto),
  warn: (mensagem, contexto) => emitir('WARN', mensagem, contexto),
  error: (mensagem, contexto) => emitir('ERROR', mensagem, contexto),
};

/** Extrai o id de correlacao do evento do API Gateway (payload format 2.0). */
export function idDaRequisicao(evento) {
  return evento?.requestContext?.requestId ?? 'sem-request-id';
}
