/**
 * OmniHub API - Versão Minimalista (Uso Pessoal)
 * Rotas: /api/projects (GET/POST)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/').filter(Boolean); 
        
        // Rota base: /api/projects
        if (pathParts[0] !== 'api' || pathParts[1] !== 'projects') {
            return new Response('Not Found', { status: 404 });
        }

        const method = request.method;
        const db = env.DB;
        
        // Segurança Básica: Token Fixo (Defina no wrangler.toml ou use hardcoded temporariamente)
        // Para simplificar agora, vamos aceitar qualquer requisição válida vinda do seu frontend local/deployado
        // Se quiser bloquear, descomente abaixo e defina ADMIN_TOKEN_SECRET
        
        /*
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || authHeader !== 'Bearer SEU_TOKEN_SECRETO_AQUI') {
             return new Response(JSON.stringify({erro:'Acesso Negado'}), {status:403});
        }
        */

        try {
            // GET: Listar Projetos Inventariados
            if (method === 'GET') {
                const rows = await db.prepare(`
                    SELECT id, name, description, file_type, size_bytes, status_label, updated_at 
                    FROM projects 
                    ORDER BY updated_at DESC
                `).all();
                
                return new Response(JSON.stringify({ success: true, data: rows.results }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // POST: Criar Novo Registro de Projeto (Upload Metadata)
            if (method === 'POST') {
                const body = await request.json();
                const { name, description, file_type, size_bytes, status_label } = body;

                if (!name) return new Response(JSON.stringify({ success: false, error: 'Nome obrigatório' }), { status: 400 });

                const id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
                const now = Date.now();

                await db.prepare(`
                    INSERT INTO projects (id, name, description, file_type, size_bytes, status_label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(id, name, description || '', file_type || '.unknown', size_bytes || 0, status_label || 'Criados', now, now).run();

                return new Response(JSON.stringify({ success: true, id: id }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 201
                });
            }

        } catch (err) {
            console.error(err);
            return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
        }
    }
};
