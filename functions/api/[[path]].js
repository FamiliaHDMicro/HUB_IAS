/**
 * SoCialBR API Router vFINAL (Substituto do Python)
 * Local: /functions/api/[[path]].js
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        // Remove '/api/' do caminho para facilitar roteamento interno
        const pathParts = url.pathname.split('/').filter(Boolean); 
        
        if (pathParts[0] !== 'api') {
            return new Response('Not Found', { status: 404 });
        }

        const route = pathParts.slice(1).join('/'); 
        const method = request.method;
        
        // Helpers Globais
        const db = env.DB; // Seu banco D1 vinculado no wrangler.toml
        const J = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
        const E = (msg, code = 400) => new Response(JSON.stringify({ erro: msg }), { status: code });
        
        const rnd = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        
        const sha = async (t) => {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        let me = null;
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const tokenRaw = authHeader.substring(7);
            const tokenHash = await sha(tokenRaw);
            me = await db.prepare('SELECT id, nome, tema_atual FROM users WHERE token_hash = ?').bind(tokenHash).first();
        }

        try {
            // --- REGISTRO / LOGIN ---
            if (route === 'registrar' && method === 'POST') {
                const body = await request.json();
                const nome = (body.nome || '').trim();
                if (!nome) return E('Nome obrigatório');

                const existing = await db.prepare('SELECT id FROM users WHERE nome = ?').bind(nome).first();
                let userId, userToken;
                
                if (existing) {
                    userId = existing.id;
                    userToken = rnd() + '-' + rnd(); 
                    const newHash = await sha(userToken);
                    await db.prepare('UPDATE users SET token_hash = ? WHERE id = ?').bind(newHash, userId).run();
                } else {
                    userId = rnd();
                    userToken = rnd() + '-' + rnd();
                    const newHash = await sha(userToken);
                    await db.prepare(`INSERT INTO users (id, nome, token_hash, tema_atual, criado_em) VALUES (?, ?, ?, 'zumbi', ?)`).bind(userId, nome, newHash, Date.now()).run();
                }
                return J({ ok: 1, token: userToken, id: userId, nome });
            }

            // --- LISTAR GRUPOS ---
            if (route === 'grupos' && method === 'GET') {
                if (!me) return E('Entre primeiro', 401);
                const rows = await db.prepare(`SELECT g.*, m.status as meu_status FROM grupos g JOIN members m ON g.id = m.group_id WHERE m.user_id = ? AND m.status = 'ativo'`).bind(me.id).all();
                return J(rows.results);
            }

             // --- CRIAR GRUPO ---
             if (route === 'grupos' && method === 'POST') {
                if (!me) return E('Entre primeiro', 401);
                const body = await request.json();
                const { nome, tipo } = body;
                if (!nome) return E('Nome do grupo obrigatório');

                const groupId = rnd();
                const now = Date.now();
                
                await db.batch([
                    db.prepare(`INSERT INTO grupos (id, nome, dono_id, status, criado_em) VALUES (?, ?, ?, 'ativo', ?)`).bind(groupId, nome, me.id, now),
                    db.prepare(`INSERT INTO members (group_id, user_id, entrou_em, status) VALUES (?, ?, ?, 'ativo')`).bind(groupId, me.id, now)
                ]);
                return J({ ok: 1, id: groupId });
            }

            return E('Rota não encontrada: ' + route, 404);

        } catch (err) {
            console.error(err);
            return E('Erro interno: ' + err.message, 500);
        }
    }
};
