import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({host:process.env.ERP_DB_HOST,port:+process.env.ERP_DB_PORT||5432,database:process.env.ERP_DB_NAME,user:process.env.ERP_DB_USER,password:process.env.ERP_DB_PASSWORD,ssl:false,connectionTimeoutMillis:10000,max:2});
const r=async(s,p=[])=>{try{return (await pool.query(s,p)).rows}catch(e){return [{ERRO:e.message}]}};
const sh=(l,d)=>console.log('\n=== '+l+' ===\n'+JSON.stringify(d,null,2));

// 1) Login do leonardo (vendedor de referência que fecha via web)
sh('leonardo login', await r(`SELECT id, login FROM usuarios WHERE id=95744209`));

// 2) dias_vencimento e condicao_pagamento_id de pedidos aprovados reais
sh('dia_vencimento e condicao_pagamento_id em pedidos aprovados', await r(`
  SELECT id, dia_vencimento, condicao_pagamento_id, prazo_pagamento_id, prazo_pagamento, numero_parcelas
  FROM pedidos WHERE situacao='A' AND tipo_pedido_id=46093
  ORDER BY data_inclusao DESC LIMIT 5`));

// 3) O que significa condicao_pagamento_id — lookup table
sh('tabela de condicoes de pagamento (amostra)', await r(`
  SELECT id, titulo FROM condicoes_pagamento LIMIT 10`));

// 4) Os user.* accounts têm permissão para FECHAR_ORCAMENTO?
//    (verificar funcoes_usuarios para um deles)
sh('funcoes de user.teste3.bomflow (302508372)', await r(`
  SELECT fu.funcao_id, fs.titulo FROM funcoes_usuarios fu
  JOIN funcoes_sistemas fs ON fs.id=fu.funcao_id
  WHERE fu.usuario_id=302508372`));

// 5) O usuario_inclusao_id dos pedidos com situacao M criados por user.*
//    (confirmar que o usuario_inclusao no payload é honrado pelo ERP)
sh('pedidos situacao A recentes criados por user.* (se algum passar)', await r(`
  SELECT p.id, p.situacao, u.login
  FROM pedidos p JOIN usuarios u ON u.id=p.usuario_inclusao_id
  WHERE u.login ILIKE 'user.%' AND p.tipo_pedido_id=46093
  ORDER BY p.data_inclusao DESC LIMIT 10`));

await pool.end(); console.log('\nFIM.');
