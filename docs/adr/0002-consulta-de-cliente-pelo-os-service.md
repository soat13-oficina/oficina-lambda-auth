# ADR 0002 — A Lambda de token consulta o cliente no OS Service, não no banco

- **Status:** Aceito
- **Data:** 2026-10-17
- **Contexto:** Tech Challenge SOAT 13 — Fase 4 ([ADR 0003](https://github.com/soat13-oficina/oficina-app/blob/desenvolvimento/docs/adr/0003-divisao-em-microsservicos-e-dono-dos-dados.md) e [0008](https://github.com/soat13-oficina/oficina-app/blob/desenvolvimento/docs/adr/0008-exposicao-e-roteamento.md) do `oficina-app`)

## Contexto

Na Fase 3 a função `token` abria uma conexão com o PostgreSQL do OS Service e lia `clientes` por CPF.
Isso a prendia a três coisas: a **VPC** (uma ENI por container, mais cold start), uma **regra no
security group do RDS** e o **esquema** da tabela do OS (a migration `V19` existe só para servir a ela).
Com a divisão em serviços, o cadastro de clientes é do OS e nenhum outro componente lê o banco dele.

## Decisão

A função chama o OS por HTTP: `GET /internal/clientes/por-cpf/{cpf}` com `X-Service-Token`, timeout de 3 s.

- O endereço é o do **ALB do ambiente**, lido do SSM (`/oficina/<env>/alb-url`) pelo Terraform e entregue em `OS_BASE_URL`. Como o ALB é público, a função **sai da VPC**; somem o security group, a regra no RDS, o `terraform_remote_state` da plataforma e do banco e a dependência `pg`.
- O ALB só encaminha `/internal/clientes/*` quando o header `X-Service-Token` está presente (qualquer valor); o **valor** é conferido pela aplicação, em tempo constante, que é o controle que vale em qualquer caminho de rede.
- O OS devolve o cliente **inativo** (`ativo: false`) em vez de escondê-lo: a distinção entre `404 CLIENTE_NAO_ENCONTRADO` e `403 CLIENTE_INATIVO` continua sendo da função.
- Só `404` significa "não existe". Qualquer outra resposta (401, 5xx, timeout) vira `500 ERRO_INTERNO` — nunca um falso "CPF não cadastrado".

## Transição

A ideia inicial era uma variável `FONTE_CLIENTE=banco|api` para trocar sem derrubar o login. Não foi
implementada: os ambientes são recriados a cada subida, o OS com o endpoint novo é implantado **antes**
deste repositório (ordem de apply no README) e manter o caminho do banco exigiria manter também a VPC, o
security group e o remote state do banco — justamente o que se quer remover. O recuo é implantar a versão
anterior.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Manter a leitura do banco | Contradiz o dono dos dados (ADR 0003) e mantém a função na VPC |
| OS publica eventos de cliente e uma Lambda mantém uma tabela DynamoDB `auth-clientes` | Mais elegante (login não depende do OS), mas pede mais um consumidor, uma tabela e consistência eventual; fica como evolução |
| ALB interno + VPC Link | Mais seguro; exige descobrir o listener criado pelo controller e configurar o VPC Link no Terraform. Evolução registrada no ADR 0008 |

## Consequências

- Login depende do OS Service no ar (antes dependia só do banco).
- Um salto de rede a mais (~dezenas de ms) no `POST /auth`.
- Menos Terraform e menos acoplamento de esquema: a coluna `clientes.ativo` passa a ser um detalhe interno do OS.
