import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Testes de integração: exigem o Postgres local de pé (docker compose up -d db).
// O Prisma Client lê process.env.DATABASE_URL no runtime e o vitest não carrega o
// .env sozinho — então lemos o .env aqui e injetamos. Rodam com `pnpm test:int`.
function loadDotEnv(path = '.env'): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trimStart().startsWith('#')) continue;
      const match = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) env[match[1]!] = match[2]!.trim();
    }
    return env;
  } catch {
    return {};
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.int.test.ts'],
    env: loadDotEnv(),
  },
});
