// =============================================================================
// TypeD V2 — Rotas de Gestão de Formulários e Blocos
// =============================================================================
//
// MULTI-TENANCY:
// Todas as rotas de gestão estão aninhadas sob /workspaces/:workspaceId/...
// Isso garante que o workspaceId está SEMPRE presente no path, tornando
// impossível esquecer de filtrar por tenant. Cada query Prisma inclui
// o workspaceId como filtro obrigatório.
//
// NOTA SOBRE AUTENTICAÇÃO (Fase Futura):
// Atualmente, estas rotas NÃO possuem middleware de autenticação JWT.
// Na Fase de Auth, adicionaremos um preHandler que:
//   1. Valida o token JWT do header Authorization
//   2. Extrai o userId do token
//   3. Verifica se o user é membro do workspace via WorkspaceMember
//   4. Injeta { userId, workspaceId, role } no request
//
// Para já, o workspaceId vem do path param e é confiável apenas em dev.
// =============================================================================

/**
 * Plugin de rotas Fastify para gestão de Forms e FormBlocks.
 * Registado no server.js com prefix '/api'.
 *
 * Rotas resultantes:
 *   GET    /api/workspaces/:workspaceId/forms
 *   POST   /api/workspaces/:workspaceId/forms
 *   GET    /api/workspaces/:workspaceId/forms/:formId
 *   PUT    /api/workspaces/:workspaceId/forms/:formId
 *   DELETE /api/workspaces/:workspaceId/forms/:formId
 *   GET    /api/workspaces/:workspaceId/forms/:formId/blocks
 *   POST   /api/workspaces/:workspaceId/forms/:formId/blocks
 *   PUT    /api/workspaces/:workspaceId/forms/:formId/blocks/:blockId
 *   DELETE /api/workspaces/:workspaceId/forms/:formId/blocks/:blockId
 *   PUT    /api/workspaces/:workspaceId/forms/:formId/blocks/reorder
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function formsRoutes(fastify) {
  const { prisma } = fastify;

  // ===========================================================================
  // HELPER: Validar que o Workspace existe
  // ===========================================================================
  // Reutilizado em múltiplas rotas para evitar queries orphans.
  // Lança 404 automaticamente via @fastify/sensible se não encontrar.
  // ===========================================================================
  async function assertWorkspaceExists(workspaceId) {
    let workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    
    // Auto-cria o workspace mock se não existir (para facilitar o desenvolvimento frontend).
    if (!workspace && workspaceId === 'ws-mock-123') {
      workspace = await prisma.workspace.create({
        data: {
          id: 'ws-mock-123',
          name: 'Workspace de Teste',
          slug: 'ws-mock-123',
        },
        select: { id: true },
      });
    }

    if (!workspace) {
      throw fastify.httpErrors.notFound(`Workspace '${workspaceId}' não encontrado.`);
    }
    return workspace;
  }

  // ===========================================================================
  // HELPER: Buscar Form garantindo pertença ao Workspace
  // ===========================================================================
  // REGRA CRÍTICA DE MULTI-TENANCY: Nunca buscar form apenas pelo formId.
  // Sempre filtrar pelo par (formId + workspaceId) para evitar que um tenant
  // acesse formulários de outro tenant manipulando o formId na URL.
  // ===========================================================================
  async function assertFormBelongsToWorkspace(formId, workspaceId) {
    const form = await prisma.form.findFirst({
      where: { id: formId, workspaceId },
    });
    if (!form) {
      throw fastify.httpErrors.notFound(
        `Formulário '${formId}' não encontrado neste workspace.`
      );
    }
    return form;
  }

  // ===========================================================================
  // HELPER: Sanitizar string para slug URL-safe
  // ===========================================================================
  function slugify(text) {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')        // espaços → hífens
      .replace(/[^\w-]+/g, '')     // remove caracteres especiais
      .replace(/--+/g, '-')        // colapsa hífens múltiplos
      .replace(/^-+|-+$/g, '');    // remove hífens do início/fim
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROTAS DE FORMULÁRIOS (CRUD)
  // ═══════════════════════════════════════════════════════════════════════════

  // ===========================================================================
  // GET /workspaces/:workspaceId/forms — Listar forms do tenant
  // ===========================================================================
  // Retorna todos os formulários do workspace, ordenados por data de criação.
  // Inclui contagem de blocos e submissions para exibição no painel admin.
  //
  // Query params opcionais:
  //   ?published=true  → filtra apenas forms publicados
  // ===========================================================================
  fastify.get('/workspaces/:workspaceId/forms', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          published: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId } = request.params;
    const { published } = request.query;

    await assertWorkspaceExists(workspaceId);

    // Monta o filtro base com multi-tenancy obrigatório.
    const where = { workspaceId };

    // Filtro opcional por estado de publicação.
    if (published !== undefined) {
      where.isPublished = published === 'true';
    }

    const forms = await prisma.form.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        // Contagens para exibição no painel (sem trazer dados pesados).
        _count: {
          select: {
            blocks: true,
            submissions: true,
          },
        },
      },
    });

    return reply.send(forms);
  });

  // ===========================================================================
  // POST /workspaces/:workspaceId/forms — Criar novo formulário
  // ===========================================================================
  // Cria um form vinculado ao workspace. O slug é gerado automaticamente
  // a partir do name (sanitizado), mas pode ser fornecido manualmente.
  //
  // Body esperado:
  // {
  //   "name": "Captação Black Friday",
  //   "displayMode": "CHAT",          // opcional, default CHAT
  //   "description": "...",            // opcional
  //   "branding": { ... },             // opcional, JSONB
  //   "settings": { ... }              // opcional, JSONB
  // }
  // ===========================================================================
  fastify.post('/workspaces/:workspaceId/forms', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:        { type: 'string', minLength: 1, maxLength: 150 },
          slug:        { type: 'string', maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          displayMode: { type: 'string', enum: ['CHAT', 'SLIDE'] },
          branding:    { type: 'object' },
          settings:    { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId } = request.params;
    const { name, slug, description, displayMode, branding, settings } = request.body;

    await assertWorkspaceExists(workspaceId);

    // Gera slug a partir do nome se não fornecido explicitamente.
    let finalSlug = slug ? slugify(slug) : slugify(name);

    // Garante unicidade do slug dentro do workspace.
    // Se "meu-form" já existe, tenta "meu-form-2", "meu-form-3", etc.
    const existingSlugs = await prisma.form.findMany({
      where: { workspaceId, slug: { startsWith: finalSlug } },
      select: { slug: true },
    });

    if (existingSlugs.length > 0) {
      const slugSet = new Set(existingSlugs.map((f) => f.slug));
      if (slugSet.has(finalSlug)) {
        let counter = 2;
        while (slugSet.has(`${finalSlug}-${counter}`)) {
          counter++;
        }
        finalSlug = `${finalSlug}-${counter}`;
      }
    }

    const form = await prisma.form.create({
      data: {
        name,
        slug: finalSlug,
        description: description || null,
        displayMode: displayMode || 'CHAT',
        branding: branding || {},
        settings: settings || {},
        workspaceId,
      },
    });

    request.log.info({ formId: form.id, slug: form.slug }, 'Formulário criado.');
    return reply.code(201).send(form);
  });

  // ===========================================================================
  // POST /workspaces/:workspaceId/forms/:formId/duplicate — Duplicar um form
  // ===========================================================================
  fastify.post('/workspaces/:workspaceId/forms/:formId/duplicate', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    await assertWorkspaceExists(workspaceId);
    
    // Busca o formulário original junto com seus blocos
    const originalForm = await prisma.form.findFirst({
      where: { id: formId, workspaceId },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!originalForm) {
      throw fastify.httpErrors.notFound(`Formulário '${formId}' não encontrado.`);
    }

    const newName = `${originalForm.name} (Cópia)`;
    let finalSlug = slugify(newName);

    // Garante unicidade do slug
    const existingSlugs = await prisma.form.findMany({
      where: { workspaceId, slug: { startsWith: finalSlug } },
      select: { slug: true },
    });

    if (existingSlugs.length > 0) {
      const slugSet = new Set(existingSlugs.map((f) => f.slug));
      if (slugSet.has(finalSlug)) {
        let counter = 2;
        while (slugSet.has(`${finalSlug}-${counter}`)) {
          counter++;
        }
        finalSlug = `${finalSlug}-${counter}`;
      }
    }

    // Cria o novo formulário clonando propriedades e blocos
    const form = await prisma.form.create({
      data: {
        name: newName,
        slug: finalSlug,
        description: originalForm.description,
        displayMode: originalForm.displayMode,
        branding: originalForm.branding || {},
        settings: originalForm.settings || {},
        workspaceId,
        isPublished: false,
        publishedBlocks: null,
        hasUnpublishedChanges: true,
        blocks: {
          create: originalForm.blocks.map((block) => ({
            type: block.type,
            order: block.order,
            config: block.config || {},
            label: block.label,
            required: block.required,
          })),
        },
      },
      include: {
        blocks: true,
      },
    });

    request.log.info({ originalFormId: formId, newFormId: form.id }, 'Formulário duplicado.');
    return reply.code(201).send(form);
  });

  // ===========================================================================
  // GET /workspaces/:workspaceId/forms/:formId — Detalhes de um form
  // ===========================================================================
  // Retorna o form completo com seus blocos ordenados.
  // Usado pelo editor do painel admin para carregar o formulário inteiro.
  // ===========================================================================
  fastify.get('/workspaces/:workspaceId/forms/:formId', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    const form = await prisma.form.findFirst({
      where: { id: formId, workspaceId },
      include: {
        blocks: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    if (!form) {
      throw fastify.httpErrors.notFound(
        `Formulário '${formId}' não encontrado neste workspace.`
      );
    }

    return reply.send(form);
  });

  // ===========================================================================
  // PUT /workspaces/:workspaceId/forms/:formId — Atualizar form
  // ===========================================================================
  // Atualiza campos do formulário (nome, slug, branding, displayMode, etc.)
  // NÃO atualiza blocos — use as rotas de blocos para isso.
  //
  // Body: campos parciais (apenas o que mudar).
  // ===========================================================================
  fastify.put('/workspaces/:workspaceId/forms/:formId', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name:        { type: 'string', minLength: 1, maxLength: 150 },
          slug:        { type: 'string', maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          displayMode: { type: 'string', enum: ['CHAT', 'SLIDE'] },
          isPublished: { type: 'boolean' },
          branding:    { type: 'object' },
          settings:    { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;
    const updates = request.body;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    // Se o slug está a ser alterado, sanitiza e valida unicidade.
    if (updates.slug) {
      updates.slug = slugify(updates.slug);

      const conflict = await prisma.form.findFirst({
        where: {
          workspaceId,
          slug: updates.slug,
          id: { not: formId }, // Exclui o próprio form da verificação.
        },
      });

      if (conflict) {
        throw fastify.httpErrors.conflict(
          `O slug '${updates.slug}' já está em uso neste workspace.`
        );
      }
    }

    const updated = await prisma.form.update({
      where: { id: formId },
      data: updates,
    });

    return reply.send(updated);
  });

  // ===========================================================================
  // DELETE /workspaces/:workspaceId/forms/:formId — Eliminar form
  // ===========================================================================
  // Remove o formulário e, por CASCADE definido no schema Prisma,
  // todos os FormBlocks e Submissions associados são eliminados.
  // ===========================================================================
  fastify.delete('/workspaces/:workspaceId/forms/:formId', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    await prisma.form.delete({ where: { id: formId } });

    request.log.info({ formId }, 'Formulário eliminado com cascade.');
    return reply.code(204).send();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROTAS DE BLOCOS (FormBlock)
  // ═══════════════════════════════════════════════════════════════════════════

  // ===========================================================================
  // GET /workspaces/:workspaceId/forms/:formId/blocks — Listar blocos
  // ===========================================================================
  // Retorna os blocos do formulário ordenados pelo campo `order` (ASC).
  // O frontend consome esta lista para renderizar o fluxo no builder e no
  // motor de exibição (CHAT/SLIDE).
  // ===========================================================================
  fastify.get('/workspaces/:workspaceId/forms/:formId/blocks', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    const blocks = await prisma.formBlock.findMany({
      where: { formId },
      orderBy: { order: 'asc' },
    });

    return reply.send(blocks);
  });

  // ===========================================================================
  // POST /workspaces/:workspaceId/forms/:formId/blocks — Criar bloco
  // ===========================================================================
  // Adiciona um novo bloco ao formulário. Se `order` não for enviado,
  // o bloco é inserido no final (max order + 1).
  //
  // Body esperado:
  // {
  //   "type": "INPUT_TEXT",
  //   "label": "Qual o seu nome?",
  //   "config": { "placeholder": "Digite aqui..." },
  //   "required": true,
  //   "order": 3                    // opcional
  // }
  // ===========================================================================
  fastify.post('/workspaces/:workspaceId/forms/:formId/blocks', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type:     { type: 'string' },
          label:    { type: 'string', maxLength: 200 },
          config:   { type: 'object' },
          required: { type: 'boolean' },
          order:    { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;
    const { type, label, config, required: isRequired, order } = request.body;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    // Se order não foi fornecido, calcula o próximo disponível.
    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const lastBlock = await prisma.formBlock.findFirst({
        where: { formId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      finalOrder = lastBlock ? lastBlock.order + 1 : 0;
    }

    // TRANSAÇÃO: Cria bloco + marca rascunho pendente atomicamente.
    const [block] = await prisma.$transaction([
      prisma.formBlock.create({
        data: {
          type,
          label: label || null,
          config: config || {},
          required: isRequired !== undefined ? isRequired : true,
          order: finalOrder,
          formId,
        },
      }),
      prisma.form.update({
        where: { id: formId },
        data: { hasUnpublishedChanges: true },
      }),
    ]);

    request.log.info({ blockId: block.id, type, order: finalOrder }, 'Bloco criado (rascunho).');
    return reply.code(201).send(block);
  });

  // ===========================================================================
  // PUT /workspaces/:workspaceId/forms/:formId/blocks/:blockId — Editar bloco
  // ===========================================================================
  // Atualiza os campos de um bloco específico (label, config, type, required).
  // Para reordenar, use a rota /blocks/reorder.
  // ===========================================================================
  fastify.put('/workspaces/:workspaceId/forms/:formId/blocks/:blockId', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId', 'blockId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
          blockId:     { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          type:     { type: 'string' },
          label:    { type: 'string', maxLength: 200 },
          config:   { type: 'object' },
          required: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId, blockId } = request.params;
    const updates = request.body;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    // Verifica que o bloco pertence ao form correto.
    const existing = await prisma.formBlock.findFirst({
      where: { id: blockId, formId },
    });

    if (!existing) {
      throw fastify.httpErrors.notFound(
        `Bloco '${blockId}' não encontrado neste formulário.`
      );
    }

    // TRANSAÇÃO: Atualiza bloco + marca rascunho pendente atomicamente.
    const [updated] = await prisma.$transaction([
      prisma.formBlock.update({
        where: { id: blockId },
        data: updates,
      }),
      prisma.form.update({
        where: { id: formId },
        data: { hasUnpublishedChanges: true },
      }),
    ]);

    return reply.send(updated);
  });

  // ===========================================================================
  // DELETE /workspaces/:workspaceId/forms/:formId/blocks/:blockId
  // ===========================================================================
  // Remove um bloco e reordena automaticamente os restantes para evitar
  // "buracos" na sequência (ex: [0, 1, 3] → [0, 1, 2]).
  //
  // TRANSAÇÃO PRISMA:
  // A eliminação e a reordenação são executadas numa transação atómica.
  // Se qualquer operação falhar, ambas são revertidas, garantindo
  // consistência do campo `order`.
  // ===========================================================================
  fastify.delete('/workspaces/:workspaceId/forms/:formId/blocks/:blockId', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId', 'blockId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
          blockId:     { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId, blockId } = request.params;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    const existing = await prisma.formBlock.findFirst({
      where: { id: blockId, formId },
    });

    if (!existing) {
      throw fastify.httpErrors.notFound(
        `Bloco '${blockId}' não encontrado neste formulário.`
      );
    }

    // -----------------------------------------------------------------------
    // TRANSAÇÃO: Delete + Reordenar numa operação atómica.
    //
    // 1. Elimina o bloco alvo.
    // 2. Decrementa o `order` de todos os blocos que vinham DEPOIS
    //    do bloco eliminado. Isso "fecha o buraco" na sequência.
    //
    // Exemplo: Blocos com order [0, 1, 2, 3]. Elimina order=1.
    //   → Delete block where order=1
    //   → UPDATE SET order = order - 1 WHERE formId = X AND order > 1
    //   → Resultado: [0, 1, 2] (sem buracos)
    // -----------------------------------------------------------------------
    await prisma.$transaction([
      prisma.formBlock.delete({ where: { id: blockId } }),
      prisma.formBlock.updateMany({
        where: {
          formId,
          order: { gt: existing.order },
        },
        data: {
          order: { decrement: 1 },
        },
      }),
      prisma.form.update({
        where: { id: formId },
        data: { hasUnpublishedChanges: true },
      }),
    ]);

    request.log.info({ blockId, formId }, 'Bloco eliminado e ordem recalculada (rascunho).');
    return reply.code(204).send();
  });

  // ===========================================================================
  // PUT /workspaces/:workspaceId/forms/:formId/blocks/reorder
  // ===========================================================================
  //
  // ╔═══════════════════════════════════════════════════════════════════════╗
  // ║  ENDPOINT CRÍTICO: Reordenação Batch de Blocos (Drag-and-Drop)      ║
  // ╠═══════════════════════════════════════════════════════════════════════╣
  // ║                                                                     ║
  // ║  O frontend (builder) permite arrastar blocos para reordená-los.    ║
  // ║  Ao soltar, envia a NOVA ordem completa como um array de IDs.       ║
  // ║  A posição no array = novo valor do campo `order`.                  ║
  // ║                                                                     ║
  // ║  Body esperado:                                                     ║
  // ║  {                                                                  ║
  // ║    "orderedIds": [                                                  ║
  // ║      "uuid-bloco-que-agora-é-0",                                   ║
  // ║      "uuid-bloco-que-agora-é-1",                                   ║
  // ║      "uuid-bloco-que-agora-é-2"                                    ║
  // ║    ]                                                                ║
  // ║  }                                                                  ║
  // ║                                                                     ║
  // ║  TRANSAÇÃO PRISMA ($transaction):                                   ║
  // ║  Todas as atualizações de `order` são executadas numa transação.    ║
  // ║  Se qualquer update falhar (ex: ID inválido), NENHUM é commitado.  ║
  // ║  Isso previne estados inconsistentes onde metade dos blocos         ║
  // ║  foi reordenada e a outra metade ficou com ordem antiga.            ║
  // ║                                                                     ║
  // ║  VALIDAÇÕES DE SEGURANÇA:                                           ║
  // ║  1. Verifica que o form pertence ao workspace (multi-tenancy)       ║
  // ║  2. Verifica que TODOS os IDs enviados pertencem ao form            ║
  // ║  3. Verifica que NENHUM bloco do form ficou de fora do array        ║
  // ║     (previne "blocos perdidos" por bug no frontend)                 ║
  // ╚═══════════════════════════════════════════════════════════════════════╝
  //
  // ===========================================================================
  fastify.put('/workspaces/:workspaceId/forms/:formId/blocks/reorder', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['orderedIds'],
        properties: {
          orderedIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;
    const { orderedIds } = request.body;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    // -----------------------------------------------------------------------
    // VALIDAÇÃO 1: Buscar todos os blocos atuais do form.
    // -----------------------------------------------------------------------
    const existingBlocks = await prisma.formBlock.findMany({
      where: { formId },
      select: { id: true },
    });

    const existingIds = new Set(existingBlocks.map((b) => b.id));
    const receivedIds = new Set(orderedIds);

    // -----------------------------------------------------------------------
    // VALIDAÇÃO 2: Todos os IDs enviados devem pertencer a este form.
    // Previne que um ID de bloco de OUTRO form seja inserido aqui.
    // -----------------------------------------------------------------------
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        throw fastify.httpErrors.badRequest(
          `Bloco '${id}' não pertence ao formulário '${formId}'.`
        );
      }
    }

    // -----------------------------------------------------------------------
    // VALIDAÇÃO 3: Todos os blocos do form devem estar no array.
    // Previne que blocos sejam "perdidos" por bug no frontend.
    // -----------------------------------------------------------------------
    for (const id of existingIds) {
      if (!receivedIds.has(id)) {
        throw fastify.httpErrors.badRequest(
          `Bloco '${id}' existe no formulário mas não foi incluído no array. ` +
          `Envie TODOS os IDs de blocos para evitar inconsistência.`
        );
      }
    }

    // -----------------------------------------------------------------------
    // VALIDAÇÃO 4: Sem duplicatas no array.
    // -----------------------------------------------------------------------
    if (orderedIds.length !== receivedIds.size) {
      throw fastify.httpErrors.badRequest(
        'O array orderedIds contém IDs duplicados.'
      );
    }

    // -----------------------------------------------------------------------
    // TRANSAÇÃO: Atualiza o campo `order` de cada bloco atomicamente.
    //
    // Monta um array de operações Prisma (uma por bloco) e executa
    // todas dentro de $transaction. Se qualquer uma falhar,
    // o PostgreSQL faz rollback de TODAS as alterações.
    //
    // O índice do array (0, 1, 2, ...) torna-se o novo `order`.
    // -----------------------------------------------------------------------
    const updateOperations = orderedIds.map((blockId, index) =>
      prisma.formBlock.update({
        where: { id: blockId },
        data: { order: index },
      })
    );

    // Inclui a flag de rascunho na mesma transação atômica.
    updateOperations.push(
      prisma.form.update({
        where: { id: formId },
        data: { hasUnpublishedChanges: true },
      })
    );

    await prisma.$transaction(updateOperations);

    request.log.info(
      { formId, totalBlocks: orderedIds.length },
      'Blocos reordenados com sucesso.'
    );

    // Retorna os blocos na nova ordem para confirmar ao frontend.
    const reordered = await prisma.formBlock.findMany({
      where: { formId },
      orderBy: { order: 'asc' },
    });

    return reply.send(reordered);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROTAS DE PUBLICAÇÃO (Draft → Production)
  // ═══════════════════════════════════════════════════════════════════════════

  // ===========================================================================
  // POST /workspaces/:workspaceId/forms/:formId/publish — Publicar alterações
  // ===========================================================================
  // Tira um snapshot dos blocos atuais da tabela FormBlock, serializa como
  // JSON e salva em `publishedBlocks`. Define `isPublished = true` e
  // `hasUnpublishedChanges = false`.
  //
  // A rota pública GET /f/:slug passará a servir este snapshot aos leads.
  // ===========================================================================
  fastify.post('/workspaces/:workspaceId/forms/:formId/publish', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    // Busca os blocos atuais (rascunho) para gerar o snapshot.
    const draftBlocks = await prisma.formBlock.findMany({
      where: { formId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        order: true,
        config: true,
        label: true,
        required: true,
      },
    });

    // Salva o snapshot e marca como publicado numa única operação.
    const updated = await prisma.form.update({
      where: { id: formId },
      data: {
        publishedBlocks: draftBlocks,
        isPublished: true,
        hasUnpublishedChanges: false,
      },
      include: {
        blocks: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    request.log.info(
      { formId, blocksCount: draftBlocks.length },
      'Formulário publicado — snapshot salvo.'
    );

    return reply.send(updated);
  });

  // ===========================================================================
  // POST /workspaces/:workspaceId/forms/:formId/unpublish — Despublicar
  // ===========================================================================
  // Remove o acesso público (isPublished = false) mas preserva tanto o
  // rascunho (FormBlock) quanto o snapshot (publishedBlocks) intactos.
  // Isso permite republicar rapidamente sem perder o estado.
  // ===========================================================================
  fastify.post('/workspaces/:workspaceId/forms/:formId/unpublish', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    await assertFormBelongsToWorkspace(formId, workspaceId);

    const updated = await prisma.form.update({
      where: { id: formId },
      data: { isPublished: false },
      include: {
        blocks: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    request.log.info({ formId }, 'Formulário despublicado.');
    return reply.send(updated);
  });

  // ===========================================================================
  // POST /workspaces/:workspaceId/forms/:formId/discard — Descartar rascunho
  // ===========================================================================
  //
  // ╔═══════════════════════════════════════════════════════════════════════╗
  // ║  OPERAÇÃO CRÍTICA: Restaura os blocos da tabela FormBlock para o    ║
  // ║  estado EXATO do último snapshot publicado (publishedBlocks).       ║
  // ║                                                                     ║
  // ║  REGRA ENTERPRISE — PRESERVAÇÃO ABSOLUTA DE IDs:                    ║
  // ║  Os blocos são recriados com os IDs ORIGINAIS do snapshot JSON.     ║
  // ║  Isso garante que respostas antigas na tabela Submission continuem  ║
  // ║  rastreáveis aos blocos corretos, preservando o analytics do funil. ║
  // ║                                                                     ║
  // ║  ACID: Toda a operação (delete + create) ocorre numa única          ║
  // ║  $transaction. O banco nunca fica sem blocos, mesmo com falha.      ║
  // ╚═══════════════════════════════════════════════════════════════════════╝
  //
  // ===========================================================================
  fastify.post('/workspaces/:workspaceId/forms/:formId/discard', {
    schema: {
      params: {
        type: 'object',
        required: ['workspaceId', 'formId'],
        properties: {
          workspaceId: { type: 'string' },
          formId:      { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, formId } = request.params;

    const form = await assertFormBelongsToWorkspace(formId, workspaceId);

    if (!form.publishedBlocks || !Array.isArray(form.publishedBlocks)) {
      throw fastify.httpErrors.conflict(
        'Não há versão publicada para restaurar. Publique o formulário pelo menos uma vez antes de descartar.'
      );
    }

    const snapshot = form.publishedBlocks;

    // -----------------------------------------------------------------
    // TRANSAÇÃO ACID:
    //   1. Remove TODOS os blocos de rascunho atuais.
    //   2. Recria os blocos a partir do snapshot com IDs originais.
    //   3. Reseta a flag de rascunho pendente.
    //
    // Se qualquer etapa falhar, o PostgreSQL faz rollback completo.
    // -----------------------------------------------------------------
    const operations = [
      // 1. Limpa os blocos de rascunho.
      prisma.formBlock.deleteMany({ where: { formId } }),
    ];

    // 2. Recria cada bloco com o ID original do snapshot.
    for (const block of snapshot) {
      operations.push(
        prisma.formBlock.create({
          data: {
            id:       block.id,
            type:     block.type,
            order:    block.order,
            config:   block.config || {},
            label:    block.label || null,
            required: block.required !== undefined ? block.required : true,
            formId,
          },
        })
      );
    }

    // 3. Reseta a flag de rascunho.
    operations.push(
      prisma.form.update({
        where: { id: formId },
        data: { hasUnpublishedChanges: false },
      })
    );

    await prisma.$transaction(operations);

    // Retorna o form atualizado com os blocos restaurados.
    const restored = await prisma.form.findFirst({
      where: { id: formId, workspaceId },
      include: {
        blocks: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    request.log.info(
      { formId, blocksRestored: snapshot.length },
      'Rascunho descartado — blocos restaurados do snapshot de produção.'
    );

    return reply.send(restored);
  });
}
