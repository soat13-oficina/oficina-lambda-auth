variable "project" {
  description = "Nome do projeto, usado em tags e como prefixo de recursos."
  type        = string
  default     = "oficina"
}

variable "aws_region" {
  description = "Regiao AWS. Precisa ser a mesma da plataforma (o ALB lido do SSM e as filas ficam nela)."
  type        = string
  default     = "us-east-1"
}

# Com POST /auth emitindo token, as rotas proxy passam a exigir Bearer valido.
#
# Voltar para false e o interruptor de emergencia se a autenticacao quebrar
# durante a demonstracao: o gateway segue roteando para a aplicacao, que mantem
# a propria protecao por JWT. Nao abre a API - move a barreira da borda de volta
# para dentro da aplicacao.
variable "enable_authorizer" {
  description = "Liga o Lambda Authorizer nas rotas proxy da aplicacao."
  type        = bool
  default     = true
}

variable "node_runtime" {
  description = "Runtime das funcoes Lambda."
  type        = string
  default     = "nodejs22.x"
}

# Rode "terraform workspace select hml" (ou prd) antes do plan/apply - o
# workspace "default" e rejeitado de proposito, ver locals.tf.
variable "environments" {
  description = "Configuracao por ambiente, indexada pelo nome do workspace do Terraform."
  type = map(object({
    token_ttl_seconds  = number
    lambda_memory_mb   = number
    lambda_timeout_s   = number
    log_retention_days = number
    throttling_rate    = number
    throttling_burst   = number
  }))

  default = {
    hml = {
      token_ttl_seconds  = 3600
      lambda_memory_mb   = 256
      lambda_timeout_s   = 15
      log_retention_days = 7
      throttling_rate    = 20
      throttling_burst   = 40
    }
    prd = {
      token_ttl_seconds  = 3600
      lambda_memory_mb   = 512
      lambda_timeout_s   = 15
      log_retention_days = 30
      throttling_rate    = 100
      throttling_burst   = 200
    }
  }
}
