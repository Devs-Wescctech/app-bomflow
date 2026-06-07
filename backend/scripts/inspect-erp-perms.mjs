// Inspeção READ-ONLY: permissões do acesso.api vs usuário que cria orçamentos.
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.ERP_DB_HOST,
  port: parseInt(process.env.ERP_DB_PORT) || 5432,
  database: process.env.ERP_DB_NAME,
  user: process.env.ERP_DB_USER,
  password: process.env.ERP_DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
  max: 2,
});

async function q(label, sql, params = []) {
  console.log('\n===== ' + label + ' =====');
  try {
    const r = await pool.query(sql, params);
    console.log('linhas:', r.rowCount);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (err) {
    console.log('ERRO:', err.message);
  }
}

(async () => {
  // 1. Registro do acesso.api
  await q('usuario acesso.api', `
    SELECT id, login, super_usuario, ativo, pessoa_id, grupo_primario_id
    FROM usuarios WHERE login = 'acesso.api' LIMIT 1
  `);

  // 2. usuarios_sistemas do acesso.api (precisa do id; subquery)
  await q('usuarios_sistemas do acesso.api', `
    SELECT us.* FROM usuarios_sistemas us
    JOIN usuarios u ON u.id = us.usuario_id
    WHERE u.login = 'acesso.api'
  `);

  // 3. Quais "sistemas" existem (procurar SGPRC)
  await q('tabela sistemas (se existir)', `
    SELECT * FROM sistemas ORDER BY id LIMIT 50
  `);

  // 4. grupos do acesso.api
  await q('grupos do acesso.api', `
    SELECT ugu.* FROM usuarios_grupos_usuarios ugu
    JOIN usuarios u ON u.id = ugu.usuario_id
    WHERE u.login = 'acesso.api'
  `);

  // 5. funcoes_usuarios columns
  await q('colunas funcoes_usuarios', `
    SELECT column_name FROM information_schema.columns
    WHERE table_name='funcoes_usuarios' ORDER BY ordinal_position
  `);

  await pool.end();
  console.log('\nFIM.');
})();
