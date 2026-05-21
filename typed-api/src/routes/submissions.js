// =============================================================================
// TypeD V2 — Rotas Públicas de Submissão (Leads)
// =============================================================================
//
// CONTEXTO:
// Estas rotas são chamadas pelo Frontend público (Modo Chat ou Modo Slide)
// quando o lead final preenche um formulário. São PÚBLICAS — não requerem
// autenticação JWT, apenas um slug de formulário válido e publicado.
//
// O endpoint principal recebe as respostas (payload) e metadados de captação
// (UTMs, browser, referrer) e cria um registo na tabela Submission.
//
// ROTA PÚBLICA vs ROTAS DE GESTÃO:
// - As rotas em forms.js são protegidas por workspace (admin panel).
// - As rotas aqui são abertas ao mundo — o lead não tem conta no sistema.
// - A única validação é: "este form existe E está publicado?"
//
// =============================================================================

/**
 * Plugin de rotas Fastify para submissão pública de formulários.
 * Registado no server.js com prefix '/api'.
 *
 * Rotas resultantes:
 *   GET  /api/f/:slug          → Buscar form público (dados para renderização)
 *   POST /api/f/:slug/submit   → Submeter respostas (criar lead)
 *   POST /api/f/:slug/partial  → Salvar progresso parcial (anti-abandono)
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function submissionsRoutes(fastify) {
  const { prisma } = fastify;

  // ===========================================================================
  // HELPER: Buscar form público por slug e validar publicação
  // ===========================================================================
  // Centraliza a lógica de busca por slug + validação de isPublished.
  // Reutilizado por todas as rotas públicas deste módulo.
  //
  // NOTA: A busca é por slug GLOBAL (não por workspace), porque o lead
  // final não sabe nem precisa saber qual workspace criou o form.
  // Se dois workspaces tiverem forms com o mesmo slug, o @@unique no schema
  // garante que isso só acontece em workspaces DIFERENTES, então usamos
  // findFirst e retornamos o primeiro encontrado.
  //
  // FUTURO: Quando implementarmos domínios customizados, a resolução
  // passará por: domínio → workspace → slug (mais preciso).
  // ===========================================================================
  async function findPublishedForm(slug, isPreview = false) {
    const where = { slug };
    
    // Se não for preview, obriga a que o formulário esteja publicado
    if (!isPreview) {
      where.isPublished = true;
    }

    const form = await prisma.form.findFirst({
      where,
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
      },
      // publishedBlocks é incluído automaticamente (não precisa de select/include
      // pois é um campo escalar do model Form, não uma relação).
    });

    if (!form) {
      // SEGURANÇA: NÃO revelar o slug na mensagem de erro.
      // Um atacante poderia enumerar slugs válidos testando respostas.
      throw fastify.httpErrors.notFound(
        'Formulário não encontrado ou não está publicado.'
      );
    }

    return form;
  }

  // ===========================================================================
  // GET /f/:slug — Buscar formulário público para renderização
  // ===========================================================================
  // O frontend (Chat ou Slide) chama este endpoint ao carregar a página
  // do formulário. Retorna:
  //   - Dados do form (name, displayMode, branding, settings)
  //   - Blocos ordenados (para o motor de renderização)
  //
  // NÃO retorna dados sensíveis (workspaceId, submissions, etc.)
  //
  // Este endpoint é o que permite a AGNOSTICIDADE de exibição:
  // O frontend lê o `displayMode` e decide se renderiza como CHAT ou SLIDE,
  // usando os mesmos blocos.
  // ===========================================================================
  fastify.get('/f/:slug', {
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          preview: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { preview } = request.query;

    const form = await findPublishedForm(slug, preview === 'true');

    // -----------------------------------------------------------------
    // ROTA PÚBLICA — Servir snapshot de produção (Enterprise)
    // -----------------------------------------------------------------
    // Se NÃO for preview e existir um snapshot publicado, servimos o
    // JSON pré-serializado diretamente. Isso é O(1) — sem JOINs,
    // sem ordenação, sem queries extras na tabela FormBlock.
    //
    // Fallback: Se publishedBlocks for null (formulários antigos ou
    // nunca publicados via nova feature), servimos da tabela FormBlock
    // para manter compatibilidade retroativa.
    // -----------------------------------------------------------------
    const isPreview = preview === 'true';
    const hasSnapshot = form.publishedBlocks && Array.isArray(form.publishedBlocks);
    const blocksToServe = (!isPreview && hasSnapshot)
      ? form.publishedBlocks
      : form.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          order: block.order,
          label: block.label,
          config: block.config,
          required: block.required,
        }));

    // Monta a resposta pública — omite campos internos que o lead
    // não precisa (e não deve) ver.
    const publicForm = {
      id: form.id,
      name: form.name,
      slug: form.slug,
      description: form.description,
      displayMode: form.displayMode,
      branding: form.branding,
      settings: form.settings,
      blocks: blocksToServe,
    };

    return reply.send(publicForm);
  });

  // ===========================================================================
  // POST /f/:slug/submit — Submeter respostas (criar lead completo)
  // ===========================================================================
  //
  // Body esperado:
  // {
  //   "payload": {
  //     "nome": "João Silva",
  //     "email": "joao@email.com",
  //     "telefone": "+5511999999999"
  //   },
  //   "metadata": {
  //     "utm_source": "google",
  //     "utm_medium": "cpc",
  //     "utm_campaign": "black-friday",
  //     "browser": "Chrome 120",
  //     "os": "Android 14",
  //     "referrer": "https://google.com",
  //     "language": "pt-BR",
  //     "screenResolution": "1080x2400",
  //     "userAgent": "Mozilla/5.0 ..."
  //   }
  // }
  //
  // O payload é FLEXÍVEL por design — cada formulário terá campos diferentes.
  // O backend NÃO valida o conteúdo do payload contra o schema dos blocos
  // (isso seria acoplamento excessivo). A validação é feita no frontend
  // antes de enviar, e os dados brutos são armazenados para máxima
  // flexibilidade em integrações (Make, Zapier, webhooks).
  //
  // ===========================================================================
  fastify.post('/f/:slug/submit', {
    // SEGURANÇA: Rate limit mais restritivo para submissões.
    // Limita a 10 submissões por minuto por IP para prevenir spam de leads.
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      body: {
        type: 'object',
        required: ['payload'],
        additionalProperties: false,
        properties: {
          payload:  { type: 'object' },
          metadata: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { payload, metadata } = request.body;

    const form = await findPublishedForm(slug);

    // -----------------------------------------------------------------
    // Enriquece metadata com dados do servidor que o frontend não possui.
    // O IP real pode estar atrás de um proxy reverso (Nginx),
    // então lemos o header X-Forwarded-For com fallback.
    // -----------------------------------------------------------------
    const enrichedMetadata = {
      ...metadata,
      ip: request.headers['x-forwarded-for']
        || request.headers['x-real-ip']
        || request.ip,
      submittedAt: new Date().toISOString(),
      serverTimestamp: Date.now(),
    };

    const submission = await prisma.submission.create({
      data: {
        payload,
        metadata: enrichedMetadata,
        isComplete: true,
        completedAt: new Date(),
        formId: form.id,
      },
    });

    request.log.info(
      { submissionId: submission.id, formSlug: slug, formId: form.id },
      'Lead capturado com sucesso.'
    );

    // -----------------------------------------------------------------
    // DISPARO ASSÍNCRONO DE WEBHOOK (Fire-and-Forget)
    // -----------------------------------------------------------------
    const webhookUrl = form.settings?.webhookUrl;
    if (webhookUrl && typeof webhookUrl === 'string') {
      const webhookPayload = {
        submissionId: submission.id,
        formSlug: slug,
        payload,
        metadata: enrichedMetadata,
        createdAt: submission.createdAt
      };

      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      }).catch(err => {
        request.log.error(
          { submissionId: submission.id, webhookUrl, err: err.message },
          'Falha no disparo do webhook'
        );
      });
    }

    // Retorna apenas o ID e timestamp — nunca devolver dados do lead
    // de volta ao browser por questões de privacidade.
    return reply.code(201).send({
      success: true,
      submissionId: submission.id,
      createdAt: submission.createdAt,
    });
  });

  // ===========================================================================
  // POST /f/:slug/partial — Salvar progresso parcial (anti-abandono)
  // ===========================================================================
  //
  // CONTEXTO DE NEGÓCIO:
  // Em formulários longos, muitos leads abandonam antes de completar.
  // Este endpoint permite que o frontend salve as respostas parciais
  // a cada bloco respondido, criando um registro com isComplete=false.
  //
  // O fluxo é:
  //   1. Lead inicia o form → frontend chama POST /partial (cria submission)
  //   2. Lead responde bloco 2 → frontend chama POST /partial (atualiza)
  //   3. Lead completa → frontend chama POST /submit (marca isComplete=true)
  //
  // Se o lead abandonar no passo 2, temos as respostas parciais salvas.
  // Isso permite análise de funil: "em qual bloco os leads desistem?"
  //
  // Body esperado:
  // {
  //   "submissionId": "uuid-existente-ou-null",
  //   "payload": { "nome": "João" },
  //   "metadata": { ... }
  // }
  //
  // Se submissionId for null, cria uma nova submission parcial.
  // Se submissionId existir, atualiza o payload da submission existente.
  // ===========================================================================
  fastify.post('/f/:slug/partial', {
    // SEGURANÇA: Rate limit para saves parciais.
    // 20/min é mais generoso que submit pois é chamado a cada bloco.
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      body: {
        type: 'object',
        required: ['payload'],
        additionalProperties: false,
        properties: {
          submissionId: { type: 'string', format: 'uuid' },
          payload:      { type: 'object' },
          metadata:     { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { submissionId, payload, metadata } = request.body;

    const form = await findPublishedForm(slug);

    // -----------------------------------------------------------------
    // CASO 1: Atualizar submission parcial existente.
    // Usa merge do payload para acumular respostas bloco a bloco.
    // -----------------------------------------------------------------
    if (submissionId) {
      const existing = await prisma.submission.findFirst({
        where: {
          id: submissionId,
          formId: form.id,
          isComplete: false, // Só atualiza se ainda não foi finalizada.
        },
      });

      if (!existing) {
        throw fastify.httpErrors.notFound(
          `Submission parcial '${submissionId}' não encontrada ou já foi finalizada.`
        );
      }

      // Merge: preserva respostas anteriores e adiciona/sobrescreve novas.
      const mergedPayload = {
        ...(typeof existing.payload === 'object' ? existing.payload : {}),
        ...payload,
      };

      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          payload: mergedPayload,
          metadata: metadata
            ? { ...(typeof existing.metadata === 'object' ? existing.metadata : {}), ...metadata }
            : undefined,
        },
      });

      return reply.send({
        success: true,
        submissionId: updated.id,
        isNew: false,
      });
    }

    // -----------------------------------------------------------------
    // CASO 2: Criar nova submission parcial.
    // -----------------------------------------------------------------
    const submission = await prisma.submission.create({
      data: {
        payload,
        metadata: metadata || {},
        isComplete: false,
        formId: form.id,
      },
    });

    request.log.info(
      { submissionId: submission.id, formSlug: slug },
      'Submission parcial criada.'
    );

    return reply.code(201).send({
      success: true,
      submissionId: submission.id,
      isNew: true,
    });
  });
}
