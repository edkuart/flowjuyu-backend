// scripts/dev/routes-to-md.ts
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync('routes.json','utf8'));
const header = '| Método | Path | Auth | Handlers |\n|---|---|---|---|';
const body = rows.map((r: any) => {
  const auth = r.handlers.some((h: string) => ['requireAuth','requireRole'].includes(h)) ? 'Sí' : 'No';
  return `| ${r.method} | \`${r.path}\` | ${auth} | ${r.handlers.join(', ')} |`;
}).join('\n');

console.log(`${header}\n${body}\n`);
