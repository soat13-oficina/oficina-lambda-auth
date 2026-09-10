import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buscarClientePorCpf, CONSULTA_CLIENTE_POR_CPF } from '../src/lib/banco.mjs';

/** Executor de mentira: registra o que foi chamado e devolve as linhas dadas. */
function executorFake(linhas) {
  const chamadas = [];
  const consultar = async (sql, parametros) => {
    chamadas.push({ sql, parametros });
    return linhas;
  };
  return { consultar, chamadas };
}

test('devolve null quando nenhum cliente casa com o CPF', async () => {
  const { consultar } = executorFake([]);
  assert.equal(await buscarClientePorCpf('52998224725', consultar), null);
});

test('mapeia a linha do banco para o formato usado pelo handler', async () => {
  const { consultar } = executorFake([
    { id: '3f1c9a2e-0000-4000-8000-000000000001', nome: 'Fulano de Tal', ativo: true },
  ]);

  const cliente = await buscarClientePorCpf('52998224725', consultar);

  assert.deepEqual(cliente, {
    id: '3f1c9a2e-0000-4000-8000-000000000001',
    nome: 'Fulano de Tal',
    ativo: true,
  });
});

test('converte o id para string, porque o driver pode devolver outro tipo', async () => {
  const { consultar } = executorFake([{ id: 42, nome: 'Ciclano', ativo: true }]);
  const cliente = await buscarClientePorCpf('52998224725', consultar);
  assert.strictEqual(cliente.id, '42');
});

test('cliente marcado como inativo chega como ativo: false', async () => {
  const { consultar } = executorFake([{ id: '1', nome: 'Beltrano', ativo: false }]);
  const cliente = await buscarClientePorCpf('52998224725', consultar);
  assert.equal(cliente.ativo, false);
});

test('ativo nulo em dado legado nao e lido como inativo', async () => {
  const { consultar } = executorFake([{ id: '1', nome: 'Beltrano', ativo: null }]);
  const cliente = await buscarClientePorCpf('52998224725', consultar);
  assert.equal(cliente.ativo, true);
});

test('passa o CPF como parametro, nunca interpolado na SQL', async () => {
  const { consultar, chamadas } = executorFake([]);
  await buscarClientePorCpf('52998224725', consultar);

  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0].parametros, ['52998224725']);
  assert.ok(!chamadas[0].sql.includes('52998224725'), 'o CPF nao pode aparecer na SQL');
  assert.ok(chamadas[0].sql.includes('$1'), 'a SQL precisa usar placeholder');
});

test('a consulta normaliza o documento na leitura', () => {
  // A coluna guarda o documento como foi digitado, com ou sem mascara; sem o
  // regexp_replace a busca por digitos nao encontraria "529.982.247-25".
  assert.ok(CONSULTA_CLIENTE_POR_CPF.includes('regexp_replace(cpf_ou_cnpj'));
  assert.ok(CONSULTA_CLIENTE_POR_CPF.includes('ativo'), 'precisa trazer o status do cliente');
});
