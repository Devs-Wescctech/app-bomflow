# Referências legadas de contratos

Este diretório preserva os arquivos enviados para análise durante a implementação da impressão e assinatura de contratos.

## Estrutura

- `php-generators/`: geradores e telas PHP legados usados para comparar regras, campos, cálculos, páginas e posicionamentos.
- `api-docs/`: documentação original das APIs em PDF e o arquivo ZIP recebido.
- `api-sources/`: conteúdo extraído do ZIP das APIs de integração do ERP, para permitir consulta direta pelo GitHub.

## Uso

Estes arquivos são somente referências históricas. Eles não fazem parte da aplicação em execução e não devem ser publicados como endpoints.

Antes da inclusão neste diretório, os arquivos textuais e o texto extraído dos PDFs foram verificados em busca de senhas, tokens, chaves e URLs com credenciais. Nenhuma credencial embutida foi identificada.

Ao reutilizar qualquer trecho, valide-o contra a implementação atual e contra o contrato vigente da API. Os arquivos legados podem conter regras descontinuadas, nomes antigos e consultas específicas do sistema de origem.