# API Gateway HTTP (v2). Ponto unico de entrada do sistema:
#
#   POST /auth      -> Lambda de token          (publico, emite o JWT)
#   ANY  /{proxy+}  -> NLB publico da aplicacao (protegido pelo authorizer)
#
# A escolha por HTTP API em vez de REST API e a razao de o authorizer ser
# Lambda (e nao o JWT authorizer nativo) estao em
# docs/adr/0001-api-gateway-e-autorizacao.md.

resource "aws_apigatewayv2_api" "main" {
  name          = local.prefixo
  description   = "Gateway de entrada da Oficina (${local.environment})"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type", "x-request-id"]
    max_age       = 300
  }
}

# ---------------------------------------------------------------------------
# Rota publica de autenticacao
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "token" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.token.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "token" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /auth"
  target    = "integrations/${aws_apigatewayv2_integration.token.id}"
  # Sem authorizer, por definicao: e aqui que o token e obtido.
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "token" {
  statement_id  = "AllowInvokeFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.token.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Authorizer (ligado por var.enable_authorizer)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "jwt" {
  count = var.enable_authorizer ? 1 : 0

  api_id           = aws_apigatewayv2_api.main.id
  name             = "${local.prefixo}-jwt"
  authorizer_type  = "REQUEST"
  authorizer_uri   = aws_lambda_function.authorizer.invoke_arn
  identity_sources = ["$request.header.Authorization"]

  authorizer_payload_format_version = "2.0"
  # Resposta simples: o handler devolve { isAuthorized: bool }, sem precisar
  # montar policy document IAM.
  enable_simple_responses = true
  # Cache por 5 min pela chave de identidade (o proprio token): requisicoes
  # seguidas do mesmo cliente nao reinvocam a funcao.
  authorizer_result_ttl_in_seconds = 300
}

resource "aws_lambda_permission" "authorizer" {
  count = var.enable_authorizer ? 1 : 0

  statement_id  = "AllowInvokeFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.jwt[0].id}"
}

# ---------------------------------------------------------------------------
# Rota proxy para a aplicacao no Kubernetes
#
# So existe quando app_base_url esta preenchido - o hostname do NLB so nasce
# depois do primeiro deploy da aplicacao naquele ambiente.
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "app" {
  count = local.publicar_proxy ? 1 : 0

  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = "${local.cfg.app_base_url}/{proxy}"

  request_parameters = {
    "overwrite:path" = "$request.path.proxy"
    # Propaga o id de correlacao do gateway para a aplicacao: o mesmo
    # identificador aparece no log da Lambda, no access log do gateway e no
    # log estruturado da API.
    "append:header.x-request-id" = "$context.requestId"
  }
}

resource "aws_apigatewayv2_route" "app" {
  count = local.publicar_proxy ? 1 : 0

  api_id    = aws_apigatewayv2_api.main.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.app[0].id}"

  authorization_type = var.enable_authorizer ? "CUSTOM" : "NONE"
  authorizer_id      = var.enable_authorizer ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

# ---------------------------------------------------------------------------
# Stage com access log estruturado
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "gateway" {
  name              = "/aws/apigateway/${local.prefixo}"
  retention_in_days = local.cfg.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # Access log em JSON, com requestId e latencia: alimenta o painel de latencia
  # das APIs exigido no requisito de observabilidade.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.gateway.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                 = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      httpMethod         = "$context.httpMethod"
      routeKey           = "$context.routeKey"
      path               = "$context.path"
      status             = "$context.status"
      protocol           = "$context.protocol"
      responseLength     = "$context.responseLength"
      responseLatencyMs  = "$context.responseLatency"
      integrationLatency = "$context.integration.latency"
      integrationStatus  = "$context.integration.status"
      authorizerError    = "$context.authorizer.error"
      errorMessage       = "$context.error.message"
    })
  }

  default_route_settings {
    throttling_rate_limit    = local.cfg.throttling_rate
    throttling_burst_limit   = local.cfg.throttling_burst
    detailed_metrics_enabled = true
  }
}
