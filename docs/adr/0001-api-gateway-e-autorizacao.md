# ADR 0001 — API Gateway HTTP, Lambda Authorizer e JWT HS256

- **Status:** Aceito
- **Data:** 2026-09-02
- **Contexto:** Tech Challenge SOAT 13 — Fase 3

## Contexto

O enunciado exige um API Gateway roteando o tráfego, rotas sensíveis protegidas
por autenticação via CPF, e uma Function Serverless que valide o CPF, consulte o
cliente na base e devolva um JWT. A aplicação principal é uma API Spring Boot já
existente, rodando em Kubernetes e **já validando JWT HS256** com um segredo
compartilhado (`JWT_SECRET`).

Três decisões se encadeiam.

## Decisão 1 — API Gateway HTTP (v2), não REST (v1)

| | HTTP API (v2) | REST API (v1) |
|---|---|---|
| Custo / milhão de req. | US$ 1,00 | US$ 3,50 |
| Latência adicional | menor | maior |
| Integração `HTTP_PROXY` para backend externo | sim | sim |
| WAF, cache de resposta, planos de uso, chaves de API | **não** | sim |

Nada do que só o REST API oferece é exigido pelo desafio. Escolhido **HTTP API**.

## Decisão 2 — Lambda Authorizer, não o JWT Authorizer nativo

O API Gateway tem um autorizador JWT nativo, que seria a opção óbvia. Ele exige,
porém, um **emissor OIDC com JWKS publicado** — ou seja, tokens assinados com
chave assimétrica (RS256) e um endpoint `/.well-known/jwks.json` acessível.

Nosso emissor é uma Lambda própria assinando com **HS256** (segredo
compartilhado), porque é isso que a API Spring Boot já valida. Um segredo HMAC
não tem JWKS, então o autorizador nativo é inaplicável.

Alternativas consideradas:

| Alternativa | Por que não |
|---|---|
| **Migrar para RS256 + JWKS** | Correto do ponto de vista de arquitetura (a API validaria com a chave pública, sem compartilhar segredo). Exigiria hospedar o JWKS, gerenciar rotação de chave e alterar a validação na aplicação — três frentes a mais numa fase que já mexe em quatro repositórios. Registrado como evolução natural. |
| **Amazon Cognito como emissor** | Resolveria o JWKS de graça e traria o autorizador nativo junto. Mas o enunciado pede explicitamente uma *Function Serverless* que valide o CPF e consulte o status do cliente na base — regra que não cabe num user pool sem, de novo, uma Lambda (trigger). Acrescentaria um serviço sem remover a função. |
| **Validar o JWT só na aplicação** | Deixaria as rotas sensíveis expostas no gateway, contra o requisito. |

Escolhido **Lambda Authorizer** (`REQUEST`, payload 2.0, *simple response*), com
cache de 300 s por token para não invocar a função a cada requisição.

## Decisão 3 — HS256 sem biblioteca externa

`src/lib/jwt.mjs` implementa assinatura e verificação com `node:crypto`, em ~60
linhas, incluindo comparação de assinatura em tempo constante e rejeição
explícita de `alg` diferente de HS256 (defesa contra confusão de algoritmo).

Motivo: o pacote da Lambda fica menor (cold start menor no caminho crítico de
toda requisição protegida) e não há CVE de terceiro para acompanhar em algo que
o runtime já sabe fazer. A cobertura de testes de `test/jwt.test.mjs` inclui
token adulterado, segredo errado, `alg: none` e expiração.

## Segredo compartilhado — contrato entre repositórios

O segredo é criado **aqui**, por este Terraform, em
`oficina/<ambiente>/jwt-secret` no Secrets Manager. A pipeline de `oficina-app`
lê por esse nome e materializa `JWT_SECRET` no `Secret` do Kubernetes.

> Consequência: **este repositório é a fonte da verdade do segredo.** Um
> `terraform destroy` aqui invalida todos os tokens em circulação e exige um
> novo deploy da aplicação para ressincronizar. Está registrado no README.

## Consequências

**Positivas**
- Um único ponto de entrada público, com *throttling*, CORS e access log JSON por requisição (`requestId`, latência total e de integração) — insumo direto do requisito de observabilidade.
- O `requestId` do gateway é propagado à aplicação no header `x-request-id`, permitindo correlacionar gateway → Lambda → API numa única busca.
- A função de token roda na VPC (alcança o RDS); o authorizer roda fora dela, evitando ENI e cold start no caminho de toda requisição protegida.

**Negativas / mitigações**
- **Segredo compartilhado entre dois repositórios.** Mitigado por nome de contrato documentado e por leitura em tempo de deploy — o valor nunca fica em código.
- **Cold start do authorizer** afeta a primeira requisição protegida. Mitigado pelo cache de 300 s; se incomodar, `provisioned_concurrency` resolve ao custo de instância reservada.
- **O NLB da aplicação continua publicamente acessível**, então é possível contornar o gateway. Foi a opção escolhida deliberadamente (VPC Link + NLB interno era a alternativa). Mitigação possível sem VPC Link: exigir um header secreto injetado pelo gateway e recusado pela aplicação quando ausente.
