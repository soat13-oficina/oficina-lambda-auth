output "environment" {
  description = "Ambiente correspondente ao workspace selecionado (hml ou prd)."
  value       = local.environment
}

output "api_gateway_url" {
  description = "URL base do API Gateway. E o endereco publico do sistema - use este, nao o do NLB."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "auth_endpoint" {
  description = "Endpoint de emissao de token (POST com {\"cpf\": \"...\"})."
  value       = "${aws_apigatewayv2_stage.default.invoke_url}auth"
}

output "jwt_secret_name" {
  description = "Nome do segredo do JWT no Secrets Manager. CONTRATO: a pipeline de oficina-app le por este nome para popular JWT_SECRET no cluster."
  value       = aws_secretsmanager_secret.jwt.name
}

output "jwt_secret_arn" {
  description = "ARN do segredo do JWT no Secrets Manager."
  value       = aws_secretsmanager_secret.jwt.arn
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

output "proxy_publicado" {
  description = "Se a rota ANY /{proxy+} para a aplicacao existe. Falso enquanto app_base_url estiver vazio."
  value       = local.publicar_proxy
}

output "lambda_security_group_id" {
  description = "Security group da funcao de token, ja liberado no RDS deste ambiente."
  value       = aws_security_group.lambda.id
}
