import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { criarHandler } from '../src/handlers/token.mjs';
import { verificar } from '../src/lib/jwt.mjs';

const SEGREDO = 'segredo-de-teste-nao-usar-em-lugar-nenhum-0123456789';

const CLIENTE_ATIVO = {
  id: '3f1c9a2e-0000-4000-8000-000000000001',
  nome: 'Fulano de Tal',
  ativo: true,
};

/** Monta o handler com banco e Secrets Manager de mentira. */
function handlerCom({ cliente = CLIENTE_ATIVO, erroNoBanco = null } = {}) {
  return criarHandler({
    buscarCliente: async () => {
      if (erroNoBanco) throw erroNoBanco;
      return cliente;
    },
    obterSegredo: async () => SEGREDO,
    ttlSegundos: 3600,
  });
}

const requisicao = (corpo) => ({
  body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  requestContext: { requestId: 'req-teste' },
});

const corpoDe = (r) => JSON.parse(r.body);

// O handler loga em JSON a cada passo; sem isto a saida do teste fica ilegivel.
let logOriginal;
beforeEach(() => {
  logOriginal = console.log;
  console.log = () => {};
});
afterEach(() => {
  console.log = logOriginal;
});

test('emite token para CPF valido de cliente ativo', async () => {
  const r = await handlerCom()(requisicao({ cpf: '529.982.247-25' }));

  assert.equal(r.statusCode, 200);
  const corpo = corpoDe(r);
  assert.equal(corpo.tipo, 'Bearer');
  assert.equal(corpo.expiraEm, 3600);
  assert.deepEqual(corpo.cliente, { id: CLIENTE_ATIVO.id, nome: CLIENTE_ATIVO.nome });
});

test('o token emitido carrega as claims que a aplicacao espera', async () => {
  const r = await handlerCom()(requisicao({ cpf: '529.982.247-25' }));
  const claims = verificar(corpoDe(r).token, SEGREDO);

  // "tipo" e o discriminador que faz o JwtAuthenticationFilter autenticar pelas
  // claims em vez de procurar o CPF na tabela usuarios.
  assert.equal(claims.tipo, 'CLIENTE');
  assert.equal(claims.sub, '52998224725', 'o subject e o CPF sem mascara');
  assert.equal(claims.clienteId, CLIENTE_ATIVO.id);
  assert.equal(claims.nome, CLIENTE_ATIVO.nome);
  assert.deepEqual(claims.roles, ['CLIENTE']);
  assert.ok(claims.exp > claims.iat);
});

test('CPF invalido para em 400, sem consultar o banco', async () => {
  let consultou = false;
  const handler = criarHandler({
    buscarCliente: async () => {
      consultou = true;
      return CLIENTE_ATIVO;
    },
    obterSegredo: async () => SEGREDO,
  });

  const r = await handler(requisicao({ cpf: '111.111.111-11' }));

  assert.equal(r.statusCode, 400);
  assert.equal(corpoDe(r).codigo, 'CPF_INVALIDO');
  assert.equal(consultou, false, 'nao deve ir ao banco com CPF reprovado');
});

test('corpo ausente ou nao-JSON responde 400', async () => {
  const handler = handlerCom();

  assert.equal((await handler(requisicao('isto nao e json'))).statusCode, 400);
  assert.equal((await handler({ requestContext: { requestId: 'x' } })).statusCode, 400);
});

test('cliente inexistente responde 404', async () => {
  const r = await handlerCom({ cliente: null })(requisicao({ cpf: '529.982.247-25' }));

  assert.equal(r.statusCode, 404);
  assert.equal(corpoDe(r).codigo, 'CLIENTE_NAO_ENCONTRADO');
});

test('cliente inativo responde 403 e nao emite token', async () => {
  const inativo = { ...CLIENTE_ATIVO, ativo: false };
  const r = await handlerCom({ cliente: inativo })(requisicao({ cpf: '529.982.247-25' }));

  assert.equal(r.statusCode, 403);
  assert.equal(corpoDe(r).codigo, 'CLIENTE_INATIVO');
  assert.equal(corpoDe(r).token, undefined);
});

test('falha do banco vira 500 sem vazar detalhe interno', async () => {
  const erro = new Error('connect ETIMEDOUT 10.0.201.15:5432');
  const r = await handlerCom({ erroNoBanco: erro })(requisicao({ cpf: '529.982.247-25' }));

  assert.equal(r.statusCode, 500);
  assert.equal(corpoDe(r).codigo, 'ERRO_INTERNO');
  assert.ok(!r.body.includes('10.0.201.15'), 'o endereco interno nao pode vazar na resposta');
});

test('toda resposta devolve o x-request-id para correlacao', async () => {
  const handler = handlerCom();

  for (const entrada of [{ cpf: '529.982.247-25' }, { cpf: 'invalido' }]) {
    const r = await handler(requisicao(entrada));
    assert.equal(r.headers['x-request-id'], 'req-teste');
    assert.equal(r.headers['content-type'], 'application/json');
  }
});
