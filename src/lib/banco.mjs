/**
 * Acesso ao PostgreSQL para consultar o cliente pelo CPF.
 *
 * O Pool vive no escopo do MODULO, nao dentro do handler: a Lambda reaproveita
 * o container entre invocacoes, entao um pool criado aqui sobrevive e evita
 * abrir conexao nova a cada requisicao. Um pool por invocacao esgotaria o
 * limite de conexoes do db.t3.micro sob qualquer carga de demonstracao.
 *
 * max = 1 porque cada container da Lambda atende uma requisicao por vez: um
 * pool maior so reservaria conexoes ociosas no banco sem ganho nenhum.
 */
import pg from 'pg';

import { lerSegredoJson } from './segredos.mjs';

const { Pool } = pg;

/**
 * Consulta com normalizacao no lado da leitura.
 *
 * A coluna cpf_ou_cnpj guarda o documento COMO FOI DIGITADO - o dominio valida
 * por digito verificador mas persiste a string original, entao a mesma pessoa
 * pode estar gravada como "529.982.247-25" ou "52998224725". O regexp_replace
 * remove tudo que nao e digito antes de comparar.
 *
 * Custo: a comparacao e sobre uma expressao, entao nao usa o indice de
 * uk_clientes_cpf_ou_cnpj. Irrelevante no volume deste projeto; em escala, o
 * caminho seria um indice funcional sobre a mesma expressao, ou normalizar na
 * escrita e migrar os dados existentes.
 *
 * PRE-REQUISITO: a coluna "ativo" e criada pela migration V19 no repositorio
 * da aplicacao. Sem ela a consulta falha com "column ativo does not exist".
 */
export const CONSULTA_CLIENTE_POR_CPF = `
  SELECT id, nome, ativo
    FROM clientes
   WHERE regexp_replace(cpf_ou_cnpj, '\\D', '', 'g') = $1
   LIMIT 1
`;

let poolPromessa = null;

/** Cria (uma vez por container) o pool, com as credenciais do Secrets Manager. */
function obterPool() {
  if (poolPromessa) return poolPromessa;

  poolPromessa = (async () => {
    const { username, password } = await lerSegredoJson(process.env.DB_SECRET_ARN);

    return new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: username,
      password,
      max: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // O RDS apresenta certificado assinado por uma CA propria da AWS, que nao
      // esta no truststore do Node. Verificar a cadeia exigiria embarcar o
      // bundle da AWS no pacote. Aceitavel aqui porque o trafego nunca sai da
      // VPC (o banco nao e publicamente acessivel e so aceita conexao do
      // security group desta funcao); em producao real, embarque o bundle e
      // use rejectUnauthorized: true.
      ssl: { rejectUnauthorized: false },
    });
  })();

  return poolPromessa;
}

/** Executor padrao: roda a consulta no pool real e devolve as linhas. */
async function consultarNoBanco(sql, parametros) {
  const pool = await obterPool();
  const { rows } = await pool.query(sql, parametros);
  return rows;
}

/**
 * @param {string} cpf CPF somente digitos.
 * @param {(sql: string, parametros: unknown[]) => Promise<object[]>} [consultar]
 *   Executor da consulta. O default vai ao banco; os testes injetam um duble.
 * @returns {Promise<{id: string, nome: string, ativo: boolean} | null>}
 *   O cliente, ou null se nao existir.
 */
export async function buscarClientePorCpf(cpf, consultar = consultarNoBanco) {
  const linhas = await consultar(CONSULTA_CLIENTE_POR_CPF, [cpf]);

  if (!linhas || linhas.length === 0) return null;

  const [linha] = linhas;

  return {
    id: String(linha.id),
    nome: linha.nome,
    // Comparacao explicita com false: a coluna e NOT NULL DEFAULT TRUE, mas um
    // null vindo de dado legado nao deve ser lido como inativo.
    ativo: linha.ativo !== false,
  };
}
