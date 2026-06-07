// Inspeção READ-ONLY: entender por que acesso.api não lista SGPRC_USUARIO.
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
  // 1. Colunas da view v_usuarios_sistemas_sgprc
  await q('colunas v_usuarios_sistemas_sgprc', `
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'v_usuarios_sistemas_sgprc' ORDER BY ordinal_position
  `);

  // 2. Amostra da view (3 linhas)
  await q('amostra v_usuarios_sistemas_sgprc', `
    SELECT * FROM v_usuarios_sistemas_sgprc LIMIT 3
  `);

  // 3. acesso.api existe na view SGPRC?
  await q('acesso.api na view SGPRC', `
    SELECT * FROM v_usuarios_sistemas_sgprc
    WHERE lower(login) LIKE '%acesso%' OR lower(usuario) LIKE '%acesso%'
    LIMIT 5
  `);

  // 4. Colunas de usuarios_sistemas
  await q('colunas usuarios_sistemas', `
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'usuarios_sistemas' ORDER BY ordinal_position
  `);

  // 5. Registro do acesso.api em usuarios (login)
  await q('usuario acesso.api', `
    SELECT login, nome, id, ativo FROM usuarios
    WHERE lower(login) = 'acesso.api' LIMIT 3
  `);

  // 6. user.teste3.bomflow na view SGPRC (o agente de venda do teste)
  await q('user.teste3.bomflow na view SGPRC', `
    SELECT * FROM v_usuarios_sistemas_sgprc
    WHERE lower(login) LIKE '%teste3%' LIMIT 5
  `);

  await pool.end();
  console.log('\nFIM.');
})();
