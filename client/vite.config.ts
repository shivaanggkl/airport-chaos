import { defineConfig, type Connect, type Plugin } from 'vite';
import { policyPage } from '../server/src/legal-pages.ts';

function publicPageMiddleware(request: Connect.IncomingMessage, response: Connect.ServerResponse, next: Connect.NextFunction): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') { next(); return; }
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const page = policyPage(pathname);
  if (!page) { next(); return; }
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  response.end(request.method === 'HEAD' ? undefined : page);
}

const publicPages = (): Plugin => ({
  name: 'airport-chaos-public-pages',
  configureServer(server) { server.middlewares.use(publicPageMiddleware); },
  configurePreviewServer(server) { server.middlewares.use(publicPageMiddleware); },
});

export default defineConfig({ plugins: [publicPages()] });
