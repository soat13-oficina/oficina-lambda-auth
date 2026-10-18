import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buscarClientePorCpf } from '../src/lib/cliente-api.mjs';

const BASE = 'http://alb-teste.us-east-1.elb.amazonaws.com';

/** fetch de mentira: registra a chamada e devolve a resposta dada. */
function fetchFalso(resposta) {
  const chamadas = [];
  const fetchFn = async (url, init) => {
    chamadas.push({ url, init });
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return { fetchFn, chamadas };
}

const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

const opcoes = (fetchFn, extra = {}) => ({
  fetchFn,
  obterSegredo: async () => 'token-de-servico',
  baseUrl: BASE,
  serviceTokenArn: 'arn:segredo',
  ...extra,
});

test('chama o endpoint interno do OS com o X-Service-Token e o request id', async () => {
  const { fetchFn, chamadas } = fetchFalso(json(200, { id: 'abc', nome: 'Maria', ativo: true }));

  await buscarClientePorCpf('52998224725', opcoes(fetchFn, { requestId: 'req-1' }));

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, `${BASE}/internal/clientes/por-cpf/52998224725`);
  assert.equal(chamadas[0].init.method, 'GET');
  assert.equal(chamadas[0].init.headers['x-service-token'], 'token-de-servico');
  assert.equal(chamadas[0].init.headers['x-request-id'], 'req-1');
  assert.ok(chamadas[0].init.signal, 'a chamada tem timeout');
});

test('barra final na URL base nao duplica a barra do caminho', async () => {
  const { fetchFn, chamadas } = fetchFalso(json(200, { id: 'abc', nome: 'Maria', ativo: true }));

  await buscarClientePorCpf('52998224725', opcoes(fetchFn, { baseUrl: `${BASE}/` }));

  assert.equal(chamadas[0].url, `${BASE}/internal/clientes/por-cpf/52998224725`);
});

test('mapeia a resposta para o formato usado pelo handler', async () => {
  const { fetchFn } = fetchFalso(json(200, { id: '3f1c9a2e-0000-4000-8000-000000000001', nome: 'Fulano', ativo: true }));

  assert.deepEqual(await buscarClientePorCpf('52998224725', opcoes(fetchFn)), {
    id: '3f1c9a2e-0000-4000-8000-000000000001',
    nome: 'Fulano',
    ativo: true,
  });
});

test('preserva ativo=false e nao confunde campo ausente com inativo', async () => {
  const inativo = fetchFalso(json(200, { id: '1', nome: 'Joao', ativo: false }));
  assert.equal((await buscarClientePorCpf('52998224725', opcoes(inativo.fetchFn))).ativo, false);

  const semCampo = fetchFalso(json(200, { id: '1', nome: 'Joao' }));
  assert.equal((await buscarClientePorCpf('52998224725', opcoes(semCampo.fetchFn))).ativo, true);
});

test('404 vira null (cliente nao cadastrado)', async () => {
  const { fetchFn } = fetchFalso(new Response(null, { status: 404 }));

  assert.equal(await buscarClientePorCpf('52998224725', opcoes(fetchFn)), null);
});

for (const status of [400, 401, 500, 503]) {
  test(`HTTP ${status} do OS e erro, nunca "cliente nao encontrado"`, async () => {
    const { fetchFn } = fetchFalso(new Response(null, { status }));

    await assert.rejects(
      () => buscarClientePorCpf('52998224725', opcoes(fetchFn)),
      (erro) => {
        assert.match(erro.message, new RegExp(`HTTP ${status}`));
        assert.ok(!erro.message.includes('52998224725'), 'o CPF nao pode vazar na mensagem de erro');
        return true;
      },
    );
  });
}

test('falha de rede ou timeout propaga a excecao', async () => {
  const { fetchFn } = fetchFalso(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

  await assert.rejects(() => buscarClientePorCpf('52998224725', opcoes(fetchFn)), { name: 'TimeoutError' });
});

test('sem OS_BASE_URL falha cedo, sem chamar o OS', async () => {
  const { fetchFn, chamadas } = fetchFalso(json(200, {}));

  await assert.rejects(() => buscarClientePorCpf('52998224725', opcoes(fetchFn, { baseUrl: '' })), /OS_BASE_URL/);
  assert.equal(chamadas.length, 0);
});
