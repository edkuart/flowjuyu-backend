// scripts/dev/scan-routes-to-md.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(process.cwd(), 'src', 'routes');
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.ts'));

function detectAuth(line) {
  // requireRole('seller' | "seller")
  const roleMatch = line.match(/requireRole\(\s*['"](\w+)['"]\s*\)/);
  if (roleMatch) return roleMatch[1];

  // requireAuth(...)
  if (/requireAuth\s*\(/.test(line)) return 'auth';

  return '';
}

function extractRoutes(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const lines = code.split('\n');

  const out = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]\s*,(.*)/i;

  for (const L of lines) {
    const m = L.match(routeRegex);
    if (!m) continue;

    const method = m[1].toUpperCase();
    const route = m[2];
    const auth = detectAuth(L);
    const handlers = [];

    // intenta capturar el último identificador de la línea como handler
    const ids = L
      .replace(/\/\/.*$/, '')
      .match(/[a-zA-Z_][a-zA-Z0-9_]*\s*(?=\)|,|$)/g);
    if (ids && ids.length) {
      // quita router.<method>, requireRole, requireAuth, upload.*, etc.
      ids.forEach(id => {
        if (/^(router|get|post|put|patch|delete|requireRole|requireAuth|upload|array|single|fields)$/.test(id)) return;
        handlers.push(id);
      });
    }

    out.push({ method, path: route, file: filePath, auth, handlers: handlers.join(', ') });
  }

  return out;
}

let rows = [];
for (const f of files) {
  rows = rows.concat(extractRoutes(path.join(SRC, f)));
}

rows.sort((a, b) => (a.path > b.path ? 1 : -1));

const header = '| Método | Path | Auth | Archivo | Handlers |\n|---|---|---|---|---|';
const body = rows
  .map(r => `| ${r.method} | \`${r.path}\` | ${r.auth || '—'} | \`${r.file}\` | ${r.handlers} |`)
  .join('\n');

process.stdout.write(`${header}\n${body}\n`);
