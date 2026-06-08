// READ-ONLY: estrutura do token + funções do agente teste vs agente real.
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.ERP_DB_HOST,
  port: parseInt(process.env.ERP_DB_PORT) || 5432,
  database: process.env.ERP_DB_NAME,
  user: process.env.ERP_DB_USER,
  password: process.env.ERP_DB_PASSWORD,
  ssl: false, connectionTimeoutMillis: 10000, max: 2,
});
async function rows(sql, p = []) { return (await pool.query(sql, p)).rows; }
function show(l, d) { console.log('\n===== ' + l + ' =====\n' + JSON.stringify(d, null, 2)); }

(async () => {
  // 1. Estrutura do ERP_AUTH_TOKEN (SEM revelar o valor)
  const tk = process.env.ERP_AUTH_TOKEN || '';
  const segs = tk.split('.');
  console.log('\n===== estrutura ERP_AUTH_TOKEN =====');
  console.log('comprimento:', tk.length, '| segmentos (pontos+1):', segs.length, '| parece JWT:', segs.length === 3);
  if (segs.length === 3) {
    try {
      const header = JSON.parse(Buffer.from(segs[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(segs[1], 'base64url').toString());
      console.log('header:', JSON.stringify(header));
      console.log('payload claim KEYS:', Object.keys(payload));
      console.log('iss:', payload.iss, '| exp:', payload.exp, '| sub presente:', 'sub' in payload, '| login claim?:', payload.login || payload.user || payload.usuario || '(n/a)');
    } catch (e) { console.log('não decodificou como JWT:', e.message); }
  }

  // 2. Usuário de teste user.teste3.bomflow
  const testUser = (await rows(`SELECT id, login, super_usuario, ativo, pessoa_id FROM usuarios WHERE login = 'user.teste3.bomflow' LIMIT 1`))[0];
  show('usuario teste user.teste3.bomflow', testUser || 'NÃO ENCONTRADO');

  // 3. Agente real bem-sucedido (id 102302323)
  const realUser = (await rows(`SELECT id, login, super_usuario, ativo, pessoa_id FROM usuarios WHERE id = 102302323 LIMIT 1`))[0];
  show('agente real 102302323', realUser || 'NÃO ENCONTRADO');

  // 4. Funções de cada um
  if (testUser) show('funcoes do usuario teste', await rows(`SELECT funcao_id FROM funcoes_usuarios WHERE usuario_id=$1 ORDER BY funcao_id`, [testUser.id]));
  if (realUser) show('funcoes do agente real (102302323)', await rows(`SELECT funcao_id FROM funcoes_usuarios WHERE usuario_id=$1 ORDER BY funcao_id`, [realUser.id]));

  await pool.end();
  console.log('\nFIM.');
})();
