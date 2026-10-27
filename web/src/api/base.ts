/**
 * Base das chamadas à API (JSON e sprites). Em dev aponta pro backend (`VITE_API_URL`, ex.:
 * `/api` com o proxy do Vite, ou `http://127.0.0.1:3000`); em prod a API serve o `web/dist` na
 * mesma origem (ADR 9), então o build define `VITE_API_URL=''` → base relativa (`/auctions`,
 * `/sprites/...`), que funciona em qualquer host e sob https. Uma fonte só pra JSON e sprites.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
