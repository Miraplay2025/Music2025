import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const headersNoCache = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function getDbClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não está configurada nas variáveis de ambiente.");
  }
  // Lê diretamente a URL contendo a string completa (incluindo o ?authToken=...)
  return createClient({ url: databaseUrl });
}

export async function GET(request) {
  try {
    const db = getDbClient();
    // Testa a conexão executando uma instrução leve
    await db.execute('SELECT 1');

    return NextResponse.json({ 
      status: 'Sucesso', 
      mensagem: 'Conexão com o banco de dados Turso realizada com sucesso!' 
    }, { headers: headersNoCache });

  } catch (error) {
    console.error('Erro detalhado no GET:', error);
    return NextResponse.json({ 
      status: 'Erro de Conexão', 
      erro_real: error.message,
      codigo: error.code || 'Desconhecido'
    }, { status: 500, headers: headersNoCache });
  }
}

export async function POST(request) {
  try {
    const reqBody = await request.json().catch(() => ({}));

    // Busca o token nas variáveis de ambiente aceitas para o webhook
    const TOKEN_ESPERADO = process.env.SECRET || process.env.Auteticar_token || process.env.AUTETICAR_TOKEN || '';
    const tokenRecebido = request.headers.get('x-webhook-secret') || request.headers.get('authorization') || '';

    if (!TOKEN_ESPERADO || String(tokenRecebido).trim() !== String(TOKEN_ESPERADO).trim()) {
      return NextResponse.json({ error: 'Acesso Negado: Token inválido ou não configurado.' }, { status: 403, headers: headersNoCache });
    }

    const db = getDbClient();

    // Cria a tabela "Atualizar-plano" caso ela não exista no padrão SQLite/Turso
    await db.execute(`
      CREATE TABLE IF NOT EXISTS "Atualizar-plano" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metodo TEXT,
        dados TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Captura e salva os dados recebidos de forma segura
    const dadosRecebidos = JSON.stringify(reqBody);

    await db.execute({
      sql: 'INSERT INTO "Atualizar-plano" (metodo, dados) VALUES (?, ?)',
      args: ['POST', dadosRecebidos]
    });

    return NextResponse.json({ 
      status: 'Sucesso', 
      mensagem: 'Webhook recebido e salvo na tabela Atualizar-plano com sucesso!' 
    }, { headers: headersNoCache });

  } catch (error) {
    console.error('Erro interno ao processar webhook:', error);
    return NextResponse.json({ 
      error: 'Erro interno ao salvar os dados.', 
      detalhes: error.message 
    }, { status: 500, headers: headersNoCache });
  }
}
