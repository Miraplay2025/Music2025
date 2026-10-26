const mysql = require('mysql2/promise');

export default async function handler(req, res) {
  // Se o usuário acessar via navegador (GET), testa a conexão com o banco de dados diretamente
  if (req.method === 'GET') {
    let testConnection;
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        return res.status(500).json({ status: 'Erro', mensagem: 'DATABASE_URL não está configurada nas variáveis de ambiente.' });
      }

      testConnection = await mysql.createConnection(dbUrl);
      await testConnection.end();

      return res.status(200).json({ 
        status: 'Sucesso', 
        mensagem: 'Conexão com o banco de dados realizada com sucesso!' 
      });
    } catch (error) {
      if (testConnection) await testConnection.end();
      return res.status(500).json({ 
        status: 'Erro de Conexão', 
        erro_real: error.message,
        codigo: error.code || 'Desconhecido'
      });
    }
  }

  // Aceita requisições POST para o Webhook
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Busca o token na variável de ambiente "SECRET"
  const TOKEN_ESPERADO = process.env.SECRET;
  const tokenRecebido = req.headers['x-webhook-secret'] || '';

  if (!TOKEN_ESPERADO || tokenRecebido !== TOKEN_ESPERADO) {
    return res.status(403).json({ error: 'Acesso Negado: Token inválido ou não configurado.' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'Erro de configuração: DATABASE_URL não definida.' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbUrl);

    // Cria a tabela "dados-sistema" caso ela não exista
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`dados-sistema\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        metodo VARCHAR(10),
        dados TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Captura e salva os dados recebidos
    const dadosRecebidos = JSON.stringify(req.body);

    await connection.execute(
      'INSERT INTO `dados-sistema` (metodo, dados) VALUES (?, ?)',
      [req.method, dadosRecebidos]
    );

    await connection.end();

    return res.status(200).json({ status: 'Sucesso', mensagem: 'Webhook recebido e salvo no banco de dados!' });
  } catch (error) {
    if (connection) await connection.end();
    console.error('Erro ao processar webhook:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao salvar os dados.', 
      detalhes: error.message 
    });
  }
}
