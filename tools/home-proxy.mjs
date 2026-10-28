// Proxy de encaminhamento mínimo, sem dependências (roda no PC residencial do dono).
// O scraper da VPS (Playwright) sai por aqui -> egress = IP residencial -> o Cloudflare da
// Tibia libera (o IP de datacenter da VPS leva "Attention Required!"). O trânsito chega da VPS
// por um túnel reverso SSH (ver tools/README.md), então o proxy escuta só em localhost.
//
// Uso: node tools/home-proxy.mjs   (Node 18+; nada pra instalar)
//   PORT (default 8899) e HOST (default 127.0.0.1) via env.
import net from 'node:net';
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8899);
const HOST = process.env.HOST ?? '127.0.0.1';
const ALLOW = /(^|\.)tibia\.com$/i; // só a Tibia (e subdomínios) — não vira proxy aberto.

const server = http.createServer((req, res) => {
  // HTTP simples (o scraper usa HTTPS via CONNECT abaixo; isto é só por completude).
  try {
    const url = new URL(req.url ?? '');
    if (!ALLOW.test(url.hostname)) {
      res.writeHead(403).end('host não permitido');
      return;
    }
    const proxyReq = http.request(
      {
        host: url.hostname,
        port: url.port || 80,
        method: req.method,
        path: url.pathname + url.search,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => res.destroy());
    req.pipe(proxyReq);
  } catch {
    res.writeHead(400).end('requisição inválida');
  }
});

// HTTPS: o cliente manda CONNECT host:443 e a gente tunela o TCP cru (o TLS é fim-a-fim).
server.on('connect', (req, clientSocket, head) => {
  const [host, portStr] = (req.url ?? '').split(':');
  if (!host || !ALLOW.test(host)) {
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  console.log(`[home-proxy] CONNECT ${host}:${portStr || 443}`);
  const serverSocket = net.connect(Number(portStr) || 443, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => serverSocket.destroy());
});

server.listen(PORT, HOST, () => console.log(`[home-proxy] escutando em ${HOST}:${PORT} (allow: *.tibia.com)`));
