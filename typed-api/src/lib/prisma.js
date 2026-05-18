// =============================================================================
// TypeD V2 — Prisma Client Singleton
// =============================================================================
//
// POR QUE UM SINGLETON?
// Em ambiente de desenvolvimento com hot-reload (--watch), cada restart
// do processo cria uma nova instância do PrismaClient. Sem singleton,
// isso esgota o pool de conexões do PostgreSQL rapidamente
// ("Too many connections" após ~10 restarts).
//
// Esta abordagem armazena a instância no objeto `globalThis` do Node.js,
// que sobrevive a hot-reloads. Em produção, globalThis é irrelevante
// porque o processo inicia uma única vez.
//
// Referência: https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
// =============================================================================

import { PrismaClient } from '@prisma/client';

/** @type {PrismaClient} */
const prisma = globalThis.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

// Em dev, persiste no globalThis para sobreviver a hot-reloads.
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export default prisma;
