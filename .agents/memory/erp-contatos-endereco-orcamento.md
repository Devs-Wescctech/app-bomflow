---
name: ERP contatos/endereço no orçamento
description: Comportamento da REST OrcamentoSgprcUsuario com contatos/endereço de cliente novo e a regra para gravar certo
---

# Contatos e endereço de cliente novo no orçamento ERP

**Lição durável (não óbvia):** a API REST `OrcamentoSgprcUsuario`, ao criar cliente novo,
grava o campo `telefone` como TELEFONE COMERCIAL e **ignora** o endereço físico, o celular e
o e-mail enviados no payload. Por isso cliente cadastrado pelo Bom Flow fica sem endereço e
com telefone "comercial". A escrita correta desses dados é por INSERT direto no banco (mesma
abordagem de itens/pessoas/admissão — ver `erp-sgprc-fechamento-block.md`).

**Truque de resolução de cidade:** `cidades.cidade` guarda no formato exato `"CIDADE - UF"`,
idêntico ao que o front monta em `un_cidade` (via viacep). Dá para resolver `cidade_id` por
igualdade direta, sem normalização extra.

**Regra de negócio acordada com o usuário:** telefone principal é auto-detectado — 11 dígitos
com "9" após o DDD → Celular; senão → Telefone residencial. Nunca gravar como comercial.

**Princípio ao corrigir contatos retroativos/idempotentes:** só converter o tipo COMERCIAL
(que é o que a API erra); nunca alterar tipos legítimos já existentes (celular/residencial) e
nunca duplicar — garantir um único registro ativo por número.
