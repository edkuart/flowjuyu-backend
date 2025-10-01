const fs = require('fs');

if (!fs.existsSync('routes.json')) {
  console.error('routes.json no existe. Corre primero: pnpm run routes:dump');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync('routes.json', 'utf8'));
const header = '| Método | Path | Auth | Handlers |\n|---|---|---|---|';
const body = rows.map((r) => {
  const handlers = Array.isArray(r.handlers) ? r.handlers : [];
  const auth = handlers.some((h) => ['requireAuth', 'requireRole', 'authMiddleware'].includes(h)) ? 'Sí' : 'No';
  return `| ${r.method || ''} | \`${r.path || ''}\` | ${auth} | ${handlers.join(', ')} |`;
}).join('\n');

console.log(`${header}\n${body}\n`);
