# oficina-lambda-auth — Function Serverless de autenticação + API Gateway

Camada de **entrada e autenticação** do Tech Challenge SOAT 13 — Fase 3.
Provisiona o **API Gateway HTTP** que é o endereço público do sistema e as duas
funções **AWS Lambda** que emitem e validam o token de acesso.

> ### ⚠️ Estado: base do repositório
> A infraestrutura, a pipeline e a biblioteca de apoio (validação de CPF, JWT,
> log estruturado) estão **prontas e testadas**. A consulta do cliente no banco
> e a emissão do token ainda **não** foram escritas — ver [O que falta](#o-que-falta).
> Enquanto isso, `POST /auth` responde **501** e o authorizer fica desligado
> (`enable_authorizer = false`), de modo que o gateway já sobe e é demonstrável.

## Lugar na arquitetura

```mermaid
flowchart LR
    C["Cliente"] -->|"POST /auth<br/>{cpf}"| GW
    C -->|"ANY /{proxy+}<br/>Bearer token"| GW

    subgraph aws["AWS"]
        GW["API Gateway HTTP"]
        GW -->|"AWS_PROXY"| TOKEN["Lambda<br/>token"]
        GW -.->|"authorizer"| AUTHZ["Lambda<br/>authorizer"]
        GW -->|"HTTP_PROXY<br/>+ x-request-id"| NLB["NLB público"]

        subgraph vpc["VPC"]
            TOKEN --> RDS[("RDS<br/>PostgreSQL")]
            NLB --> APP["API Spring Boot<br/>no EKS"]
            APP --> RDS
        end

        SM["Secrets Manager<br/>jwt-secret"] --> TOKEN
        SM --> AUTHZ
        SM -.->|"lido no deploy"| APP
    end

    style GW fill:#7f4f24,color:#fff
    style TOKEN fill:#2d6a4f,color:#fff
    style AUTHZ fill:#2d6a4f,color:#fff
```

**Pré-requisito:** `oficina-infra-k8s` **e** `oficina-infra-database` aplicados
naquele ambiente — este repositório lê os dois states via `terraform_remote_state`.

## Rotas

| Rota | Integração | Autenticação |
|---|---|---|
| `POST /auth` | Lambda `token` | Pública — é onde o token é obtido |
| `ANY /{proxy+}` | NLB público da aplicação | Lambda Authorizer (quando `enable_authorizer = true`) |

A rota proxy só é criada depois que `app_base_url` do ambiente é preenchido — o
hostname do NLB só existe após o primeiro deploy da aplicação. Até lá o gateway
expõe apenas `/auth`, e o `apply` funciona normalmente.

### Contrato de `POST /auth`

```jsonc
// requisição
{ "cpf": "529.982.247-25" }

// 200
{ "token": "eyJhbGciOiJIUzI1NiIs...", "expiraEm": 3600, "tipo": "Bearer" }

// 400 CPF_INVALIDO · 404 CLIENTE_NAO_ENCONTRADO · 403 CLIENTE_INATIVO · 500 ERRO_INTERNO
{ "codigo": "CPF_INVALIDO", "mensagem": "CPF invalido." }
```

Toda resposta carrega o header `x-request-id`, o mesmo id que aparece no log
estruturado e no access log do gateway.

## O que já está pronto

| Arquivo | O que faz | Testes |
|---|---|---|
| `src/lib/cpf.mjs` | Validação por dígito verificador, normalização e máscara para log | 6 casos |
| `src/lib/jwt.mjs` | Assina e verifica HS256 com `node:crypto`; comparação em tempo constante e rejeição de `alg` != HS256 | 6 casos |
| `src/lib/segredos.mjs` | Lê o Secrets Manager com cache no container | — |
| `src/lib/log.mjs` | Log JSON com `requestId` de correlação | — |
| `src/handlers/authorizer.mjs` | **Completo.** Valida o Bearer token e devolve `isAuthorized` + contexto | — |
| `src/handlers/token.mjs` | Parse, validação de CPF, respostas de erro e log. Emissão de token pendente | — |
| `infra/` | Terraform completo: gateway, 2 Lambdas, IAM, security groups, segredo, log groups | — |

```bash
npm test     # 12 testes, sem framework externo (node:test)
```

## O que falta

Um único bloco `TODO(auth)` em [`src/handlers/token.mjs`](src/handlers/token.mjs):

1. `npm install pg`
2. Ler credenciais: `await lerSegredoJson(process.env.DB_SECRET_ARN)`
3. `SELECT id, nome, ativo FROM cliente WHERE cpf = $1` — ajustar ao schema real
4. Não encontrado → `404`; inativo → `403`
5. Encontrado e ativo → `assinar({ sub, clienteId, nome, roles }, segredo)` e devolver `200`
6. No **mesmo PR**, virar `enable_authorizer` para `true` em `infra/variables.tf`

As variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SECRET_ARN`, `JWT_SECRET_ARN` e
`TOKEN_TTL_SECONDS` já são injetadas pelo Terraform, e a IAM Role já tem
permissão de leitura nos dois segredos — só nesses dois, e só os do ambiente.

## Tecnologias

Node.js 22 (ESM, zero dependência além do AWS SDK) · `node:test` · AWS Lambda ·
API Gateway HTTP (v2) · AWS Secrets Manager · CloudWatch Logs · Terraform ≥ 1.10
com workspaces · GitHub Actions.

## Como rodar e implantar

```bash
npm ci
npm test
npm run build          # monta build/ com src + node_modules de produção

cd infra
cp backend.hcl.example backend.hcl              # bucket do state
cp terraform.tfvars.example terraform.tfvars    # mesma bucket
terraform init -backend-config=backend.hcl
terraform workspace select -or-create hml       # ou prd
terraform apply
```

⚠️ **`npm run build` antes de qualquer `terraform plan/apply`.** O
`archive_file` empacota `build/`; sem ele o plan falha com *no such file or
directory*. A pipeline já faz isso.

Depois do primeiro deploy da aplicação, pegue o hostname do NLB e preencha
`app_base_url` para publicar a rota proxy:

```bash
kubectl -n oficina-hml get svc oficina-api \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

## CI/CD

Workflow: [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)

| Gatilho | O que roda |
|---|---|
| Pull request | `npm test` → `fmt` → `validate` → `plan` dos dois workspaces, comentado no PR |
| Push em `desenvolvimento` | Testes + plan dos dois workspaces |
| **Push em `homologacao`** | Testes → build → **`apply` no workspace `hml`** → smoke test de `POST /auth` |
| **Push em `master`** | Testes → build → **`apply` no workspace `prd`** → smoke test |
| *Run workflow* manual | `plan`, `apply` ou `destroy` no ambiente escolhido |

O smoke test faz um `POST /auth` real depois do apply e falha o job se o gateway
não responder — pega rota mal configurada ou `lambda_permission` faltando, que
são os erros silenciosos mais comuns aqui.

### Configuração exigida no repositório

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `AWS_ACCESS_KEY_ID` | Credencial AWS da pipeline |
| Secret | `AWS_SECRET_ACCESS_KEY` | — |
| Variable | `TF_STATE_BUCKET` | **A mesma bucket** das outras camadas |
| Variable | `AWS_REGION` | Opcional, default `us-east-1` |

### Regras de proteção de branch

`master` e `homologacao` protegidas, merge só por Pull Request, fluxo
`feature/*` → `desenvolvimento` → `homologacao` → `master` imposto pelo job
`guard` ([`pr-source-guard.yml`](.github/workflows/pr-source-guard.yml)).

## Contrato do segredo JWT com o repositório da aplicação

O segredo HMAC é criado **aqui**, em `oficina/<ambiente>/jwt-secret` no Secrets
Manager, e lido pela pipeline de `oficina-app` para popular `JWT_SECRET` no
cluster. Este repositório é a **fonte da verdade** do segredo.

> Um `terraform destroy` aqui gera um segredo novo no próximo `apply`, o que
> invalida todos os tokens em circulação e exige um novo deploy da aplicação
> para ressincronizar.

## Custo estimado

Lambda e API Gateway são pagos por uso e ficam **dentro do *free tier*** no
volume de uma demonstração (1 M de requisições/mês grátis na Lambda; US$ 1,00 por
milhão no HTTP API). O custo relevante desta camada é praticamente zero — o que
pesa é a plataforma (EKS/NAT) e o banco.

## Limitações conhecidas (escopo de desafio técnico)

- **HS256 com segredo compartilhado.** RS256 + JWKS seria a evolução correta; a justificativa está no ADR.
- **O NLB da aplicação segue público**, então é possível contornar o gateway. Decisão consciente (a alternativa era VPC Link + NLB interno).
- **CORS liberado para `*`.** Adequado à demo; um front real fixaria a origem.

## Documentação

- [ADR 0001 — API Gateway HTTP, Lambda Authorizer e JWT HS256](docs/adr/0001-api-gateway-e-autorizacao.md)
- ADRs de infraestrutura: repositórios `oficina-infra-k8s` e `oficina-infra-database`
