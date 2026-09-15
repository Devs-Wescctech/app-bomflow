/*
 * AJUSTES MANUAIS — TABELAS ERP DO BOM AUTO E BOM PET
 *
 * Este arquivo é somente um roteiro revisável. Ele não é carregado pela aplicação
 * e deve ser executado manualmente no cliente PostgreSQL conectado ao banco correto.
 *
 * Ordem segura:
 *   1. Execute a seção 1 (somente leitura).
 *   2. Resolva manualmente protocolos duplicados, nulos ou vazios encontrados.
 *   3. Confirme que os valores atuais de origem são compatíveis com Plano/Particular.
 *   4. Execute cada comando das seções 2 e 3 separadamente.
 *   5. Execute a seção 4 (somente leitura).
 *
 * IMPORTANTE:
 *   - O script não corrige nem ignora duplicidades.
 *   - As constraints de protocolo falharão se existirem duplicidades.
 *   - Os blocos DO tornam a criação das constraints idempotente por nome.
 *   - Ajuste o schema abaixo se as tabelas não estiverem no schema public.
 */


-- ============================================================================
-- 1. VERIFICAÇÕES PRÉVIAS (SOMENTE LEITURA)
-- ============================================================================

-- 1.1 Confirme que as duas tabelas existem e em qual schema estão.
SELECT table_schema, table_name
  FROM information_schema.tables
 WHERE table_name IN ('x_atendimentos_bom_auto', 'x_atendimentos_bom_pet')
 ORDER BY table_schema, table_name;

-- 1.2 Confira as colunas e tipos já existentes.
SELECT table_schema,
       table_name,
       ordinal_position,
       column_name,
       data_type,
       character_maximum_length,
       numeric_precision,
       numeric_scale,
       is_nullable,
       column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('x_atendimentos_bom_auto', 'x_atendimentos_bom_pet')
 ORDER BY table_name, ordinal_position;

-- 1.3 Liste protocolos duplicados no Bom Auto.
-- A consulta deve retornar zero linhas antes da criação da constraint UNIQUE.
SELECT protocolo, COUNT(*) AS quantidade
  FROM public.x_atendimentos_bom_auto
 GROUP BY protocolo
HAVING COUNT(*) > 1
 ORDER BY quantidade DESC, protocolo;

-- 1.4 Liste protocolos duplicados no Bom Pet.
-- A consulta deve retornar zero linhas antes da criação da constraint UNIQUE.
SELECT protocolo, COUNT(*) AS quantidade
  FROM public.x_atendimentos_bom_pet
 GROUP BY protocolo
HAVING COUNT(*) > 1
 ORDER BY quantidade DESC, protocolo;

-- 1.5 Localize protocolos nulos ou vazios. UNIQUE permite vários NULLs, portanto
-- esta validação é separada para que a decisão sobre dados inválidos seja explícita.
SELECT 'x_atendimentos_bom_auto' AS tabela, id, protocolo
  FROM public.x_atendimentos_bom_auto
 WHERE protocolo IS NULL OR BTRIM(protocolo) = ''
UNION ALL
SELECT 'x_atendimentos_bom_pet' AS tabela, id, protocolo
  FROM public.x_atendimentos_bom_pet
 WHERE protocolo IS NULL OR BTRIM(protocolo) = ''
 ORDER BY tabela, id;

-- 1.6 Confira constraints e índices atuais ligados às duas tabelas.
SELECT c.conrelid::regclass AS tabela,
       c.conname AS constraint_name,
       c.contype AS constraint_type,
       pg_get_constraintdef(c.oid) AS definicao
  FROM pg_constraint c
 WHERE c.conrelid IN (
       'public.x_atendimentos_bom_auto'::regclass,
       'public.x_atendimentos_bom_pet'::regclass
 )
 ORDER BY tabela, constraint_name;

SELECT schemaname, tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename IN ('x_atendimentos_bom_auto', 'x_atendimentos_bom_pet')
 ORDER BY tablename, indexname;

-- 1.7 Execute esta consulta depois de adicionar a coluna origem e antes de criar
-- a constraint de domínio. Ela deve retornar zero linhas.
-- Se a coluna ainda não existir, esta consulta falhará; isso é esperado nesta etapa.
SELECT origem, COUNT(*) AS quantidade
  FROM public.x_atendimentos_bom_pet
 WHERE origem IS NULL
    OR origem NOT IN ('Plano', 'Particular')
 GROUP BY origem
 ORDER BY origem NULLS FIRST;

-- 1.8 Validação recomendada para valor particular.
-- A consulta deve retornar zero linhas antes da constraint opcional de coerência.
-- Se a coluna ainda não existir, execute-a após o comando 3.2.
SELECT id, protocolo, origem, valor_particular
  FROM public.x_atendimentos_bom_pet
 WHERE valor_particular IS NOT NULL
   AND valor_particular < 0
 ORDER BY id;


-- ============================================================================
-- 2. BOM AUTO — EXECUTAR UM COMANDO POR VEZ
-- ============================================================================

-- 2.1 Data em que o atendimento foi finalizado.
ALTER TABLE public.x_atendimentos_bom_auto
  ADD COLUMN IF NOT EXISTS data_finalizacao TIMESTAMPTZ;

-- 2.2 Data em que o atendimento foi integrado ao ERP.
ALTER TABLE public.x_atendimentos_bom_auto
  ADD COLUMN IF NOT EXISTS data_integracao TIMESTAMPTZ;

-- 2.3 Protocolo obrigatório.
-- PRÉ-REQUISITO: a parte do Bom Auto na consulta 1.5 deve retornar zero linhas.
ALTER TABLE public.x_atendimentos_bom_auto
  ALTER COLUMN protocolo SET NOT NULL;

-- 2.4 Unicidade do protocolo.
-- PRÉ-REQUISITO: a consulta 1.3 deve retornar zero linhas.
-- O PostgreSQL não oferece ADD CONSTRAINT IF NOT EXISTS; o bloco verifica o nome.
-- Se houver outro UNIQUE equivalente com nome diferente, revise antes de executar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.x_atendimentos_bom_auto'::regclass
       AND conname = 'uq_x_atendimentos_bom_auto_protocolo'
  ) THEN
    ALTER TABLE public.x_atendimentos_bom_auto
      ADD CONSTRAINT uq_x_atendimentos_bom_auto_protocolo UNIQUE (protocolo);
  END IF;
END
$$;


-- ============================================================================
-- 3. BOM PET — EXECUTAR UM COMANDO POR VEZ
-- ============================================================================

-- 3.1 Origem do atendimento.
-- O DEFAULT classifica registros antigos e novos sem origem como Plano.
ALTER TABLE public.x_atendimentos_bom_pet
  ADD COLUMN IF NOT EXISTS origem VARCHAR(12) NOT NULL DEFAULT 'Plano';

-- 3.2 Valor cobrado em atendimento Particular. NULL para Plano ou não informado.
ALTER TABLE public.x_atendimentos_bom_pet
  ADD COLUMN IF NOT EXISTS valor_particular NUMERIC(12,2);

-- 3.3 Data de falecimento do pet (mesmo nome usado pelo Bom Flow).
ALTER TABLE public.x_atendimentos_bom_pet
  ADD COLUMN IF NOT EXISTS pet_data_falecimento DATE;

-- 3.4 Data em que o atendimento foi finalizado.
ALTER TABLE public.x_atendimentos_bom_pet
  ADD COLUMN IF NOT EXISTS data_finalizacao TIMESTAMPTZ;

-- 3.5 Data em que o atendimento foi integrado ao ERP.
ALTER TABLE public.x_atendimentos_bom_pet
  ADD COLUMN IF NOT EXISTS data_integracao TIMESTAMPTZ;

-- 3.6 Domínio permitido para origem.
-- PRÉ-REQUISITO: a consulta 1.7 deve retornar zero linhas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.x_atendimentos_bom_pet'::regclass
       AND conname = 'ck_x_atendimentos_bom_pet_origem'
  ) THEN
    ALTER TABLE public.x_atendimentos_bom_pet
      ADD CONSTRAINT ck_x_atendimentos_bom_pet_origem
      CHECK (origem IN ('Plano', 'Particular'));
  END IF;
END
$$;

-- 3.7 Valor particular não pode ser negativo.
-- PRÉ-REQUISITO: a consulta 1.8 deve retornar zero linhas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.x_atendimentos_bom_pet'::regclass
       AND conname = 'ck_x_atendimentos_bom_pet_valor_particular'
  ) THEN
    ALTER TABLE public.x_atendimentos_bom_pet
      ADD CONSTRAINT ck_x_atendimentos_bom_pet_valor_particular
      CHECK (valor_particular IS NULL OR valor_particular >= 0);
  END IF;
END
$$;

-- 3.8 Protocolo obrigatório.
-- PRÉ-REQUISITO: a parte do Bom Pet na consulta 1.5 deve retornar zero linhas.
ALTER TABLE public.x_atendimentos_bom_pet
  ALTER COLUMN protocolo SET NOT NULL;

-- 3.9 Unicidade do protocolo.
-- PRÉ-REQUISITO: a consulta 1.4 deve retornar zero linhas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.x_atendimentos_bom_pet'::regclass
       AND conname = 'uq_x_atendimentos_bom_pet_protocolo'
  ) THEN
    ALTER TABLE public.x_atendimentos_bom_pet
      ADD CONSTRAINT uq_x_atendimentos_bom_pet_protocolo UNIQUE (protocolo);
  END IF;
END
$$;


-- ============================================================================
-- 4. VALIDAÇÃO FINAL (SOMENTE LEITURA)
-- ============================================================================

-- 4.1 Confirme as novas colunas, tipos, nulabilidade e defaults.
SELECT table_name,
       ordinal_position,
       column_name,
       data_type,
       character_maximum_length,
       numeric_precision,
       numeric_scale,
       is_nullable,
       column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (
     (table_name = 'x_atendimentos_bom_auto'
       AND column_name IN ('protocolo', 'data_finalizacao', 'data_integracao'))
     OR
     (table_name = 'x_atendimentos_bom_pet'
       AND column_name IN (
         'protocolo',
         'origem',
         'valor_particular',
         'pet_data_falecimento',
         'data_finalizacao',
         'data_integracao'
       ))
   )
 ORDER BY table_name, ordinal_position;

-- 4.2 Confirme as constraints explícitas criadas por este roteiro.
SELECT c.conrelid::regclass AS tabela,
       c.conname AS constraint_name,
       c.contype AS constraint_type,
       pg_get_constraintdef(c.oid) AS definicao
  FROM pg_constraint c
 WHERE c.conrelid IN (
       'public.x_atendimentos_bom_auto'::regclass,
       'public.x_atendimentos_bom_pet'::regclass
 )
   AND c.conname IN (
       'uq_x_atendimentos_bom_auto_protocolo',
       'uq_x_atendimentos_bom_pet_protocolo',
       'ck_x_atendimentos_bom_pet_origem',
       'ck_x_atendimentos_bom_pet_valor_particular'
   )
 ORDER BY tabela, constraint_name;

-- 4.3 Confirme os índices que sustentam as constraints UNIQUE.
SELECT schemaname, tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
       'uq_x_atendimentos_bom_auto_protocolo',
       'uq_x_atendimentos_bom_pet_protocolo'
   )
 ORDER BY tablename, indexname;

-- 4.4 Repita a verificação de duplicidade. Ambas devem retornar zero linhas.
SELECT 'x_atendimentos_bom_auto' AS tabela, protocolo, COUNT(*) AS quantidade
  FROM public.x_atendimentos_bom_auto
 GROUP BY protocolo
HAVING COUNT(*) > 1
UNION ALL
SELECT 'x_atendimentos_bom_pet' AS tabela, protocolo, COUNT(*) AS quantidade
  FROM public.x_atendimentos_bom_pet
 GROUP BY protocolo
HAVING COUNT(*) > 1
 ORDER BY tabela, quantidade DESC, protocolo;