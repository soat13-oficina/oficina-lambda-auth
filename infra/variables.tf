variable "project" {
  description = "Nome do projeto, usado em tags e como prefixo de recursos."
  type        = string
  default     = "oficina"
}

variable "aws_region" {
  description = "Regiao AWS. Precisa ser a mesma da plataforma e do banco."
  type        = string
  default     = "us-east-1"
}

# A MESMA bucket do backend deste repositorio. O backend parcial nao expoe seu
# valor como variavel, por isso ele precisa ser informado explicitamente
# (-var, TF_VAR_state_bucket ou terraform.tfvars).
variable "state_bucket" {
  description = "Bucket S3 com os states da plataforma e do banco, lidos aqui via terraform_remote_state."
  type        = string
}

variable "platform_state_key" {
  description = "Key do state da plataforma. Deve casar com o backend de oficina-infra-k8s."
  type        = string
  default     = "oficina/infra-k8s.tfstate"
}

variable "database_state_key" {
  description = "Key do state do banco. Deve casar com o backend de oficina-infra-database."
  type        = string
  default     = "oficina/infra-database.tfstate"
}

# Enquanto a emissao de token nao estiver implementada (ver
# src/handlers/token.mjs), manter false: com o authorizer ligado e sem forma de
# obter um token, TODAS as rotas da aplicacao ficariam inacessiveis pelo gateway.
# Vire para true no mesmo PR que implementar o handler.
variable "enable_authorizer" {
  description = "Liga o Lambda Authorizer nas rotas proxy da aplicacao."
  type        = bool
  default     = false
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
    # Hostname publico do NLB criado pelo Service da aplicacao no Kubernetes.
    # Vazio ate o primeiro deploy da aplicacao naquele ambiente: enquanto
    # estiver vazio, a rota proxy nao e criada e so /auth existe no gateway.
    app_base_url       = string
    token_ttl_seconds  = number
    lambda_memory_mb   = number
    lambda_timeout_s   = number
    log_retention_days = number
    throttling_rate    = number
    throttling_burst   = number
  }))

  default = {
    hml = {
      app_base_url       = ""
      token_ttl_seconds  = 3600
      lambda_memory_mb   = 256
      lambda_timeout_s   = 15
      log_retention_days = 7
      throttling_rate    = 20
      throttling_burst   = 40
    }
    prd = {
      app_base_url       = ""
      token_ttl_seconds  = 3600
      lambda_memory_mb   = 512
      lambda_timeout_s   = 15
      log_retention_days = 30
      throttling_rate    = 100
      throttling_burst   = 200
    }
  }
}
