const express = require('express');
const { createClient } = require('@libsql/client');
const { obterFusoPorPais } = require('./fuso-horario');

const app = express();
app.use(express.json());

// ==========================================
// 1. PREVENÇÃO TOTAL DE CACHE
// ==========================================
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// ==========================================
// 2. VALIDAÇÃO DE DOMÍNIO AUTORIZADO (autoedite.ct.ws)
// O domínio é validado antes de qualquer ação ou acesso à base de dados.
// ==========================================
app.use((req, res, next) => {
    if (req.method !== 'POST') return res.status(403).send();

    const origem = req.headers['origin'] || req.headers['referer'] || req.headers['x-origem-dominio'] || '';

    // Se o domínio de origem não for o oficial ou localhost, bloqueia imediatamente
    if (!origem || (!origem.includes('autoedite.ct.ws') && !origem.includes('localhost'))) {
        return res.status(403).json({ 
            sucesso: false, 
            mensagem: "Acesso negado por política de domínio." 
        });
    }

    next();
});

// Função para instanciar o cliente do banco de dados Turso/SQLite
function getDbClient() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL ausente.");
    return createClient({ url: databaseUrl });
}

// ==========================================
// 3. FUNÇÃO DE OBTENÇÃO DE HORA ATUAL POR PAÍS
// Usa o módulo auxiliar fuso-horario.js para calcular o tempo real no fuso correto.
// ==========================================
function obterDataHoraAtualPorPais(paisStr) {
    try {
        const timeZone = obterFusoPorPais(paisStr);
        const options = { 
            timeZone, 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false 
        };
        const formatter = new Intl.DateTimeFormat('en-CA', options);
        const parts = formatter.formatToParts(new Date());
        const obj = {};
        parts.forEach(p => { obj[p.type] = p.value; });
        return new Date(`${obj.year}-${obj.month}-${obj.day}T${obj.hour}:${obj.minute}:${obj.second}`);
    } catch (e) {
        return new Date();
    }
}

// ==========================================
// 4. ROTA PRINCIPAL: /api/verificar-bonus
// ==========================================
app.post('/verificar-bonus', async (req, res) => {
    let db;
    // Erro padrão exigido para qualquer inconsistência ou falha de sistema/conexão
    const MENSAGEM_ERRO_PADRAO = "algo deu errado tente novamente ou entre em contato com suporte";

    try {
        const bodyReq = req.body || {};
        const emailRecebido = bodyReq.email;

        // Valida se o e-mail foi enviado corretamente no corpo da requisição
        if (!emailRecebido || typeof emailRecebido !== 'string' || !emailRecebido.includes('@')) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: "E-mail do usuário obrigatório ausente." 
            });
        }

        const emailLimpo = emailRecebido.trim();

        // Tentativa de conexão com o Banco de Dados com tratamento de erro e sufixo "BD"
        try {
            db = getDbClient();
        } catch (dbErr) {
            return res.status(500).json({ 
                sucesso: false, 
                mensagem: `${MENSAGEM_ERRO_PADRAO} [ERR_CONEXAO_FALHOU] ( BD )` 
            });
        }

        // Procura o usuário na tabela "auto-edite-user" ignorando maiúsculas/minúsculas e espaços
        const rsUsuario = await db.execute({
            sql: 'SELECT * FROM "auto-edite-user" WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1',
            args: [emailLimpo]
        });

        // Se o usuário não for encontrado na base de dados
        if (rsUsuario.rows.length === 0) {
            return res.status(404).json({ 
                sucesso: false, 
                mensagem: "usuario não existe" 
            });
        }

        const usuarioEncontrado = rsUsuario.rows[0];
        const statusUser = String(usuarioEncontrado.status || '').trim().toLowerCase();
        const planoUser = String(usuarioEncontrado.plano || '').trim().toLowerCase();

        // Valida se a conta está com status verificado
        if (statusUser !== 'verificado') {
            return res.status(403).json({ 
                sucesso: false, 
                mensagem: "Ha um problema com a sua conta" 
            });
        }

        // Valida se o plano atual do usuário é estritamente "gratuito". Se for diferente, retorna a mensagem solicitada.
        if (planoUser !== 'gratuito') {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: "Voçê ja não é qualificado pra esse bonus" 
            });
        }

        // Obtém o fuso horário e a hora atual do país cadastrado do usuário
        const paisUser = usuarioEncontrado.pais || 'Brasil';
        const dataHoraAtualPais = obterDataHoraAtualPorPais(paisUser);
        const dataExpiraStr = usuarioEncontrado.conta_expira;

        // Se a data de expiração estiver vazia ou ausente, retorna o erro padrão
        if (!dataExpiraStr) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: MENSAGEM_ERRO_PADRAO 
            });
        }

        const dataExpiraDate = new Date(dataExpiraStr.replace(' ', 'T'));

        // Compara se o tempo atual do país já ultrapassou a data de expiração do bônus
        if (dataHoraAtualPais > dataExpiraDate) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: `O seu bonus expirou em ${dataExpiraStr}` 
            });
        }

        // Caso todas as validações passem com sucesso:
        return res.status(200).json({
            sucesso: true,
            mensagem: "bonus aprovado com sucesso"
        });

    } catch (error) {
        // Qualquer erro inesperado retorna estritamente o erro padrão
        return res.status(500).json({ 
            sucesso: false, 
            mensagem: MENSAGEM_ERRO_PADRAO 
        });
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT);
}
