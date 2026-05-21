import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';

export default async function uploadsRoutes(app) {
  // POST /workspaces/:workspaceId/upload
  app.post('/workspaces/:workspaceId/upload', async (request, reply) => {
    // Obter o arquivo da requisição multipart
    const data = await request.file();

    if (!data) {
      return reply.badRequest('Nenhum arquivo foi enviado.');
    }

    const { workspaceId } = request.params;
    
    // Gerar um UUID para o nome do arquivo preservando a extensão original
    const ext = path.extname(data.filename);
    const filename = `${crypto.randomUUID()}${ext}`;
    
    // Caminho absoluto para a pasta uploads na raiz do projeto da API
    const uploadDir = path.join(process.cwd(), 'uploads');
    const saveTo = path.join(uploadDir, filename);

    // Salvar o arquivo localmente usando streams para evitar consumo excessivo de memória
    await pipeline(data.file, fs.createWriteStream(saveTo));

    // Retornar a URL de acesso público
    return { url: `/uploads/${filename}` };
  });
}
