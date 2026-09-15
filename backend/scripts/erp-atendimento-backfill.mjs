import fs from 'node:fs';
import process from 'node:process';
import {
  buildErpAtendimentoBackfillPreview,
  releaseErpAtendimentoBackfill,
  stageErpAtendimentoBackfill,
} from '../src/services/erpAtendimentoBackfillService.js';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=') || true];
}));
const protocols = String(args.get('protocols') || '').split(',').map((v) => v.trim()).filter(Boolean);
const limit = Number(args.get('limit') || 20);

if (args.has('stage')) {
  if (!protocols.length) throw new Error('Informe --protocols=PROTOCOLO1,PROTOCOLO2.');
  console.log(JSON.stringify(await stageErpAtendimentoBackfill(protocols, { limit }), null, 2));
} else if (args.has('release')) {
  if (args.get('confirm') !== 'LIBERAR_BACKFILL_ERP') {
    throw new Error('Liberação bloqueada. Use --confirm=LIBERAR_BACKFILL_ERP após autorização explícita.');
  }
  if (!protocols.length) throw new Error('Informe --protocols=PROTOCOLO1,PROTOCOLO2.');
  console.log(JSON.stringify(await releaseErpAtendimentoBackfill(protocols, { limit }), null, 2));
} else {
  const items = await buildErpAtendimentoBackfillPreview();
  const summary = items.reduce((acc, item) => {
    const key = `${item.modulo}:${item.classification}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const report = {
    generated_at: new Date().toISOString(),
    source_environment: String(
      args.get('environment-label')
        || (process.env.REPLIT_DEPLOYMENT === '1' ? 'production' : 'development')
    ),
    summary,
    items,
  };
  if (args.get('output')) {
    fs.writeFileSync(String(args.get('output')), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}