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
// 2. IMPEDIR ACESSO DIRETO VIA NAVEGADOR
// Retorna erro padrão HTTP 403 caso o acesso seja direto (GET / navegação simples)
// ou se a origem não for o domínio autorizado.
// ==========================================
app.use((req, res, next) => {
    // Bloqueia qualquer método que não seja POST (acessos diretos pelo navegador usam GET)
    if (req.method !== 'POST') {
        return res.status(403).send('Forbidden: Direct access is not allowed.');
    }

    const origem = req.headers['origin'] || req.headers['referer'] || req.headers['x-origem-dominio'] || '';

    // Validação estrita de origem do domínio
    if (!origem || (!origem.includes('autoedite.ct.ws') && !origem.includes('localhost'))) {
        return res.status(403).send('Forbidden: Access denied by domain policy.');
    }

    next();
});

function getDbClient() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL ausente.");
    return createClient({ url: databaseUrl });
}

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
// 3. ROTA PRINCIPAL: /api/verificar-bonus
// ==========================================
app.post('/verificar-bonus', async (req, res) => {
    let db;
    const MENSAGEM_ERRO_PADRAO = "algo deu errado tente novamente ou entre em contato com suporte";

    try {
        const bodyReq = req.body || {};
        const emailRecebido = bodyReq.email;

        if (!emailRecebido || typeof emailRecebido !== 'string' || !emailRecebido.includes('@')) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: "E-mail do usuário obrigatório ausente." 
            });
        }

        const emailLimpo = emailRecebido.trim();

        try {
            db = getDbClient();
        } catch (dbErr) {
            return res.status(500).json({ 
                sucesso: false, 
                mensagem: `${MENSAGEM_ERRO_PADRAO} [ERR_CONEXAO_FALHOU] ( BD )`,
                erro_real: dbErr.message || String(dbErr)
            });
        }

        const rsUsuario = await db.execute({
            sql: 'SELECT * FROM "auto-edite-user" WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1',
            args: [emailLimpo]
        });

        if (rsUsuario.rows.length === 0) {
            return res.status(404).json({ 
                sucesso: false, 
                mensagem: "usuario não existe" 
            });
        }

        const usuarioEncontrado = rsUsuario.rows[0];
        const statusUser = String(usuarioEncontrado.status || '').trim().toLowerCase();
        const planoUser = String(usuarioEncontrado.plano || '').trim().toLowerCase();

        if (statusUser !== 'verificado') {
            return res.status(403).json({ 
                sucesso: false, 
                mensagem: "Ha um problema com a sua conta" 
            });
        }

        if (planoUser !== 'gratuito') {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: "Voçê ja não é qualificado pra esse bonus" 
            });
        }

        const paisUser = usuarioEncontrado.pais || 'Brasil';
        const dataHoraAtualPais = obterDataHoraAtualPorPais(paisUser);
        const dataExpiraStr = usuarioEncontrado.conta_expira;

        if (!dataExpiraStr) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: MENSAGEM_ERRO_PADRAO,
                erro_real: "Campo conta_expira ausente na base de dados."
            });
        }

        const dataExpiraDate = new Date(dataExpiraStr.replace(' ', 'T'));

        if (dataHoraAtualPais > dataExpiraDate) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: `O seu bonus expirou em ${dataExpiraStr}` 
            });
        }

        return res.status(200).json({
            sucesso: true,
            mensagem: "bonus aprovado com sucesso"
        });

    } catch (error) {
        return res.status(500).json({ 
            sucesso: false, 
            mensagem: MENSAGEM_ERRO_PADRAO,
            erro_real: error.message || String(error)
        });
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT);
}
