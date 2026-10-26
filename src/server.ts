import { buildApp } from './app.js';
import { resolvePort } from './env.js';

const app = buildApp();
const port = resolvePort(process.env.PORT);
const host = process.env.HOST ?? '0.0.0.0';

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
