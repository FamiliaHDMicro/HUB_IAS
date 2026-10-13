/**
 * SoCialBR API Router vFINAL
 * Substitui o antigo [[path]].js completamente.
 * Integra Rotas Originais + Novas Rotas FalaAki.
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/').filter(Boolean); // Remove vazios
        
        // Rota Base: /api/...
        if (pathParts[0] !== 'api') {
            return new Response('Not Found', { status: 404 });
        }

        const route = pathParts.slice(1).join('/'); // Ex: 'registrar', 'grupos', 'fala/posts'
        const method = request.method;
        
        // Helpers Globais
        const db = env.DB;
        const J = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
        const E = (msg, code = 400) => new Response(JSON.stringify({ erro: msg }), { status: code });
        
        // Gera ID Aleatório Simples
        const rnd = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        
        // Hash SHA-256 para Tokens
        const sha = async (t) => {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        // --- AUTENTICAÇÃO BÁSICA ---
        let me = null;
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const tokenRaw = authHeader.substring(7);
            const tokenHash = await sha(tokenRaw);
            
            // Busca usuário pelo hash do token
            me = await db.prepare('SELECT id, nome, tema_atual FROM users WHERE token_hash = ?').bind(tokenHash).first();
        }

        // Middleware: Rotas que exigem login
        const requireAuth = () => {
            if (!me) throw new Error('UNAUTHORIZED');
            return me;
        };

        try {
            // ==========================================
            // ROTAS ORIGINAIS SOCIAIBR
            // ==========================================

            // 1. Registrar / Login Simples (Gera Token Novo)
            if (route === 'registrar' && method === 'POST') {
                const body = await request.json();
                const nome = (body.nome || '').trim();
                
                if (!nome) return E('Nome obrigatório');

                // Verifica se já existe (pelo nome, simplificado)
                // Em produção ideal seria email/cpf, mas aqui usamos nome único local
                const existing = await db.prepare('SELECT id FROM users WHERE nome = ?').bind(nome).first();
                
                let userId, userToken;
                
                if (existing) {
                    userId = existing.id;
                    // Reutiliza token existente? Não, gera novo para segurança
                    userToken = rnd() + '-' + rnd(); 
                    const newHash = await sha(userToken);
                    await db.prepare('UPDATE users SET token_hash = ? WHERE id = ?').bind(newHash, userId).run();
                } else {
                    userId = rnd();
                    userToken = rnd() + '-' + rnd();
                    const newHash = await sha(userToken);
                    
                    await db.prepare(`
                        INSERT INTO users (id, nome, token_hash, tema_atual, criado_em) 
                        VALUES (?, ?, ?, 'zumbi', ?)
                    `).bind(userId, nome, newHash, Date.now()).run();
                }

                return J({ ok: 1, token: userToken, id: userId, nome });
            }

            // 2. Get Me (Perfil Atual)
            if (route === 'eu' && method === 'GET') {
                requireAuth();
                return J(me);
            }

            // 3. Listar Grupos do Usuário
            if (route === 'grupos' && method === 'GET') {
                requireAuth();
                
                // Pega grupos onde ele é membro ATIVO
                const rows = await db.prepare(`
                    SELECT g.*, m.status as meu_status 
                    FROM grupos g
                    JOIN members m ON g.id = m.group_id
                    WHERE m.user_id = ? AND m.status = 'ativo'
                `).bind(me.id).all();
                
                return J(rows.results);
            }

            // 4. Criar Grupo
            if (route === 'grupos' && method === 'POST') {
                requireAuth();
                const body = await request.json();
                const { nome, tipo } = body;
                
                if (!nome) return E('Nome do grupo obrigatório');

                const groupId = rnd();
                const now = Date.now();
                
                await db.batch([
                    db.prepare(`INSERT INTO grupos (id, nome, dono_id, status, criado_em) VALUES (?, ?, ?, 'ativo', ?)`)
                      .bind(groupId, nome, me.id, now),
                    db.prepare(`INSERT INTO members (group_id, user_id, entrou_em, status) VALUES (?, ?, ?, 'ativo')`)
                      .bind(groupId, me.id, now)
                ]);

                return J({ ok: 1, id: groupId });
            }

            // 5. Gerar Convite
            if (route.match(/^grupos\/(.+)\/convites$/) && method === 'POST') {
                requireAuth();
                const groupId = route.split('/')[1];
                
                // Valida se é dono ou admin simples (aqui assume dono)
                const grp = await db.prepare('SELECT * FROM grupos WHERE id = ?').bind(groupId).first();
                if (!grp || grp.dono_id !== me.id) return E('Permissão negada', 403);

                const inviteId = rnd();
                const inviteToken = rnd();
                const expires = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 dias
                
                await db.prepare(`
                    INSERT INTO invites (id, group_id, invited_by, token_hash, expira_em, status) 
                    VALUES (?, ?, ?, ?, ?, 'novo')
                `).bind(inviteId, groupId, me.id, await sha(inviteToken), expires).run();

                return J({ ok: 1, token: inviteToken });
            }

            // 6. Aceitar Convite
            if (route === 'convites/aceitar' && method === 'POST') {
                requireAuth();
                const body = await request.json();
                const rawToken = body.token;
                
                if (!rawToken) return E('Token inválido');
                const tokenHash = await sha(rawToken);
                
                const invite = await db.prepare('SELECT * FROM invites WHERE token_hash = ? AND status = ?').bind(tokenHash, 'novo').first();
                
                if (!invite) return E('Convite inválido ou já usado');
                if (invite.expira_em < Date.now()) return E('Convite expirado');

                // Insere como membro
                try {
                    await db.prepare(`
                        INSERT INTO members (group_id, user_id, invited_by, entrou_em, status) 
                        VALUES (?, ?, ?, ?, 'ativo')
                    `).bind(invite.group_id, me.id, invite.invited_by, Date.now()).run();
                    
                    // Marca convite como usado
                    await db.prepare('UPDATE invites SET status = ?, usado_por = ? WHERE id = ?')
                        .bind('usado', me.id, invite.id).run();
                        
                } catch(e) {
                     // Se já for membro, ignora erro de PK duplicate
                     if(!e.message.includes('UNIQUE constraint failed')) throw e;
                }

                return J({ ok: 1 });
            }


            // ==========================================
            // NOVAS ROTAS FALAAKI (HUB SOCIAL)
            // ==========================================
            
            // Prefixo: fala/...

            // 7. Listar Grupos FalaAki (Públicos/Beta)
            if (route === 'fala/grupos' && method === 'GET') {
                // Não exige login estrito para listar abertos, mas filtra membros ativos
                const rows = await db.prepare(`
                    SELECT fg.*, COUNT(fm.user_ref) as total_membros 
                    FROM fala_grupos fg
                    LEFT JOIN fala_membros fm ON fg.id = fm.group_id AND fm.status = 'ativo'
                    WHERE fg.status = 'ativo'
                    GROUP BY fg.id
                `).all();
                return J(rows.results);
            }

            // 8. Entrar em Grupo FalaAki (Auto-Join se aberto)
            if (route === 'fala/join' && method === 'POST') {
                requireAuth(); // Precisa ter conta no sistema principal
                const body = await request.json();
                const gid = body.group_id;
                
                const grp = await db.prepare('SELECT * FROM fala_grupos WHERE id = ?').bind(gid).first();
                if (!grp) return E('Grupo não encontrado');
                if (grp.tipo !== 'aberto') return E('Este grupo é fechado');

                // Tenta inserir membro
                try {
                    await db.prepare(`
                        INSERT INTO fala_membros (group_id, user_ref, entrou_em, status) 
                        VALUES (?, ?, ?, 'ativo')
                    `).bind(gid, me.id, Date.now()).run();
                } catch(e) {
                    if(!e.message.includes('UNIQUE constraint failed')) throw e;
                }
                
                return J({ ok: 1 });
            }

            // 9. Postar no FalaAki
            if (route === 'fala/posts' && method === 'POST') {
                requireAuth();
                const body = await request.json();
                const { group_id, conteudo } = body;
                
                if (!group_id || !conteudo) return E('Dados incompletos');
                
                // Verifica se é membro
                const isMember = await db.prepare('SELECT 1 FROM fala_membros WHERE group_id = ? AND user_ref = ? AND status = ?')
                    .bind(group_id, me.id, 'ativo').first();
                
                if (!isMember) return E('Você não faz parte deste grupo.', 403);

                const postId = rnd();
                await db.prepare(`
                    INSERT INTO fala_posts (id, group_id, autor_ref, conteudo, tipo_conteudo, criado_em) 
                    VALUES (?, ?, ?, ?, 'texto', ?)
                `).bind(postId, group_id, me.id, conteudo.slice(0, 2000), Date.now()).run();

                return J({ ok: 1, id: postId });
            }

            // 10. Ler Posts do FalaAki
            if (route.match(/^fala\/posts\/(.+)$/) && method === 'GET') {
                requireAuth();
                const gid = route.split('/')[2];
                
                // Verifica membresia
                 const isMember = await db.prepare('SELECT 1 FROM fala_membros WHERE group_id = ? AND user_ref = ? AND status = ?')
                    .bind(gid, me.id, 'ativo').first();
                if (!isMember) return E('Acesso restrito', 403);

                const rows = await db.prepare(`
                    SELECT fp.id, fp.conteudo, fp.criado_em, u.nome as autor_nome 
                    FROM fala_posts fp
                    JOIN users u ON fp.autor_ref = u.id
                    WHERE fp.group_id = ?
                    ORDER BY fp.criado_em DESC
                    LIMIT 50
                `).bind(gid).all();
                
                return J(rows.results);
            }


            // FALLBACK
            return E('Rota não encontrada: ' + route, 404);

        } catch (err) {
            console.error(err);
            if (err.message === 'UNAUTHORIZED') {
                return E('Entre primeiro', 401);
            }
            return E('Erro interno: ' + err.message, 500);
        }
    }
};
