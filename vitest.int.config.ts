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
      if (match) env[match[1]!] = match[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
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
    // Um único Postgres compartilhado: rodar os arquivos em série evita que o
    // beforeEach (deleteMany) de um arquivo colida com os dados de outro.
    fileParallelism: false,
    // pg-boss (start + polling) é mais lento que uma query avulsa.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
