output "environment" {
  description = "Ambiente correspondente ao workspace selecionado (hml ou prd)."
  value       = local.environment
}

output "api_gateway_url" {
  description = "URL base do API Gateway. E o endereco publico do sistema - use este, nao o do ALB."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "auth_endpoint" {
  description = "Endpoint de emissao de token (POST com {\"cpf\": \"...\"})."
  value       = "${aws_apigatewayv2_stage.default.invoke_url}auth"
}

output "jwt_secret_name" {
  description = "Nome do segredo do JWT no Secrets Manager (criado pelo infra/ do OS Service, lido por nome)."
  value       = data.aws_secretsmanager_secret.jwt.name
}

output "jwt_secret_arn" {
  description = "ARN do segredo do JWT no Secrets Manager."
  value       = data.aws_secretsmanager_secret.jwt.arn
}

output "token_function_name" {
  description = "Nome da funcao Lambda de emissao de token."
  value       = aws_lambda_function.token.function_name
}

output "authorizer_function_name" {
  description = "Nome da funcao Lambda do authorizer."
  value       = aws_lambda_function.authorizer.function_name
}

output "authorizer_enabled" {
  description = "Se as rotas proxy exigem JWT. Falso ate a emissao de token ser implementada."
  value       = var.enable_authorizer
}

output "alb_url" {
  description = "Endereco do ALB lido do SSM (/oficina/<env>/alb-url): destino das rotas proxy e da consulta de cliente."
  value       = local.app_base_url
}

output "webhook_mercadopago_url" {
  description = "URL publica do webhook do Mercado Pago (vai em MERCADOPAGO_NOTIFICATION_URL do Environment do Billing)."
  value       = "${aws_apigatewayv2_stage.default.invoke_url}webhooks/mercadopago"
}
