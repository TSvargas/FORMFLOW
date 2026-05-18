// =============================================================================
// TypeD V2 — Server Entry Point (Fastify)
// =============================================================================
//
// RESPONSABILIDADES DESTE FICHEIRO:
// 1. Instanciar e configurar o Fastify
// 2. Registar plugins globais (CORS, Sensible)
// 3. Decorar a instância com o Prisma Client (DI pobre mas eficaz)
// 4. Registar módulos de rotas
// 5. Lifecycle hooks (graceful shutdown)
//
// DECISÃO: Usamos `fastify.decorate('prisma', prisma)` para injetar
// o client em toda a árvore de plugins. Isso evita imports diretos
// do singleton em cada ficheiro de rota, facilita mocking em testes,
// e segue o padrão Decorator do Fastify.
// =============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import prisma from './lib/prisma.js';

// --- Módulos de Rotas ---
import formsRoutes from './routes/forms.js';
import submissionsRoutes from './routes/submissions.js';

// =============================================================================
// 1. INSTÂNCIA FASTIFY
// =============================================================================
const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  // Gera requestId para rastreamento em logs (útil em produção).
  genReqId: () => crypto.randomUUID(),

  // SEGURANÇA: trustProxy é OBRIGATÓRIO quando atrás de Nginx/Cloudflare.
  // Sem isto, request.ip retorna o IP do proxy, não do cliente real.
  // O rate-limit usaria o mesmo IP para TODOS os clientes → inútil.
  trustProxy: true,

  // SEGURANÇA: Limita o tamanho máximo do body a 1MB.
  // Previne ataques de memory exhaustion (payload bombs).
  // Formulários de chat raramente excedem 50KB de respostas.
  bodyLimit: 1_048_576, // 1MB em bytes
});

// =============================================================================
// 2. PLUGINS GLOBAIS
// =============================================================================

// CORS — Em produção, CORS_ORIGIN deve ser a URL exata do frontend.
// Em dev, '*' é aceite para facilitar. O @fastify/cors parseia
// automaticamente arrays separados por vírgula.
await app.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});

// Sensible — Adiciona helpers como reply.notFound(), reply.badRequest(), etc.
// Evita escrever objetos de erro manualmente em cada handler.
await app.register(sensible);

// =============================================================================
// SEGURANÇA: Helmet — Headers HTTP de Proteção
// =============================================================================
// Adiciona automaticamente headers como:
//   - X-Content-Type-Options: nosniff (previne MIME sniffing)
//   - X-Frame-Options: SAMEORIGIN (previne clickjacking)
//   - Strict-Transport-Security (força HTTPS)
//   - X-XSS-Protection, X-DNS-Prefetch-Control, etc.
//
// contentSecurityPolicy desabilitado aqui porque a API não serve HTML.
// O frontend terá seu próprio CSP via meta tags.
// =============================================================================
await app.register(helmet, {
  contentSecurityPolicy: false, // API pura — sem HTML para proteger.
});

// =============================================================================
// SEGURANÇA: Rate Limiting Global
// =============================================================================
// Limita cada IP a 100 requests por minuto globalmente.
// Endpoints sensíveis (submit, partial) têm limites mais restritivos
// definidos diretamente nas rotas via routeConfig.
//
// Sem rate limiting, um atacante pode:
//   - Fazer brute-force em slugs para descobrir forms privados
//   - Spammar o POST /submit com milhares de leads falsos
//   - Causar DDoS no PostgreSQL via queries em massa
//
// O rate-limit usa o request.ip (confiável graças ao trustProxy: true).
// =============================================================================
await app.register(rateLimit, {
  max: 100,               // 100 requests por janela
  timeWindow: '1 minute',
  // Headers padrão (X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After)
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
});

// =============================================================================
// 3. PRISMA CLIENT — Decorator (Dependency Injection)
// =============================================================================
// Decora a instância Fastify com o Prisma Client.
// Em qualquer rota, acede-se via `fastify.prisma` ou `request.server.prisma`.
//
// O hook onClose garante que a conexão com o PostgreSQL é encerrada
// graciosamente quando o servidor desliga (SIGTERM em Docker, Ctrl+C local).
// =============================================================================
app.decorate('prisma', prisma);

app.addHook('onClose', async (instance) => {
  await instance.prisma.$disconnect();
  instance.log.info('🔌 Prisma desconectado do PostgreSQL.');
});

// =============================================================================
// 4. HEALTH CHECK
// =============================================================================
// Endpoint simples para monitoramento (Docker HEALTHCHECK, UptimeRobot, etc.)
// Verifica se o servidor responde E se a conexão com o DB está ativa.
// =============================================================================
app.get('/health', async (request, reply) => {
  try {
    // Raw query leve para validar conexão real com o PostgreSQL.
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', timestamp: new Date().toISOString() };
  } catch (err) {
    request.log.error(err, 'Health check falhou — conexão com DB indisponível.');
    return reply.serviceUnavailable('Conexão com banco de dados indisponível.');
  }
});

// =============================================================================
// 5. REGISTO DE ROTAS
// =============================================================================
// Cada módulo de rotas é registado com um prefixo.
// Isso isola responsabilidades e permite versionamento futuro (/api/v2/...).
//
// NOTA: O prefixo /api é aplicado aqui, NÃO dentro de cada ficheiro de rota.
// Isso permite reutilizar os módulos com prefixos diferentes se necessário.
// =============================================================================
await app.register(formsRoutes, { prefix: '/api' });
await app.register(submissionsRoutes, { prefix: '/api' });

// =============================================================================
// 6. INICIALIZAÇÃO DO SERVIDOR
// =============================================================================
const PORT = parseInt(process.env.PORT, 10) || 4012;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 obrigatório dentro de Docker

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`🚀 TypeD V2 API a correr em http://${HOST}:${PORT}`);
} catch (err) {
  app.log.fatal(err, 'Falha ao iniciar o servidor.');
  process.exit(1);
}

// =============================================================================
// 7. GRACEFUL SHUTDOWN
// =============================================================================
// Captura sinais de terminação para fechar conexões limpamente.
// Dentro de Docker, o SIGTERM é enviado pelo `docker stop`.
// O Fastify já chama os hooks `onClose` internamente via app.close().
// =============================================================================
const gracefulShutdown = async (signal) => {
  app.log.info(`⚡ Sinal ${signal} recebido. Iniciando shutdown gracioso...`);
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
