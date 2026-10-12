/**
 * OmniHub Worker v1.1 - Fixed Routes & Error Handling
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Headers (Essencial para o HTML local chamar a API)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    };

    // Tratamento Preflight OPTIONS
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // --- ROTAS DE PROJETOS (Painel Admin) ---
      if (path === '/api/projects' && method === 'GET') {
        return await getProjects(env, corsHeaders);
      }
      
      if (path === '/api/projects' && method === 'POST') {
        return await createProject(request, env, corsHeaders);
      }

      if (path.startsWith('/api/projects/') && method === 'PATCH') {
        const id = path.split('/').pop();
        return await updateProjectStatus(id, request, env, corsHeaders);
      }

      // --- ROTAS DA SALA VIP (Chat) ---
      if (path === '/api/chat' && method === 'POST') {
        return await handleChat(request, env, corsHeaders);
      }

      // --- ROTA DE SAÚDE (Teste Simples) ---
      if (path === '/' || path === '/health') {
        return new Response(JSON.stringify({ 
          status: "ok", 
          message: "OmniHub Worker is alive!",
          available_routes: ["/api/projects", "/api/chat"]
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // --- ERRO 404 PADRONIZADO ---
      return new Response(JSON.stringify({ 
        error: "Endpoint não encontrado", 
        requested_path: path,
        hint: "Verifique se você está chamando /api/projects ou /api/chat"
      }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (err) {
      // Captura qualquer erro interno do banco ou código
      console.error("Worker Error:", err);
      return new Response(JSON.stringify({ 
        error: "Erro Interno no Servidor", 
        details: err.message 
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }
};

// ==========================================
// FUNÇÕES AUXILIARES (Mesma lógica anterior)
// ==========================================

async function getProjects(env, headers) {
  try {
    const stmt = env.HUBDB.prepare(`
      SELECT p.id, p.name, p.description, p.file_type, p.size_bytes, 
             p.created_at, p.updated_at, ps.label as status_label, ps.color_hex
      FROM projects p
      JOIN project_statuses ps ON p.status_id = ps.id
      ORDER BY p.updated_at DESC
      LIMIT 100
    `);
    const { results } = await stmt.all();
    return Response.json({ success: true, count: results.length, data: results }, { headers });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers });
  }
}

async function createProject(request, env, headers) {
  try {
    const body = await request.json();
    const { name, description, file_type, size_bytes, status_label } = body;
    
    if (!name || !status_label) {
      return Response.json({ error: "Nome e status_label obrigatórios" }, { status: 400, headers });
    }

    const statusRes = await env.HUBDB.prepare("SELECT id FROM project_statuses WHERE label = ?")
      .bind(status_label).first();
    
    if (!statusRes) {
      return Response.json({ error: `Status '${status_label}' inválido` }, { status: 400, headers });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.HUBDB.prepare(`
      INSERT INTO projects (id, name, description, file_type, size_bytes, status_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, description || '', file_type || '', size_bytes || 0, statusRes.id, now, now).run();

    await env.HUBDB.prepare(`
      INSERT INTO project_status_history (id, project_id, to_status_id, changed_at, reason, changed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), id, statusRes.id, now, 'Criação via API', 'admin').run();

    return Response.json({ success: true, id }, { status: 201, headers });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers });
  }
}

async function updateProjectStatus(id, request, env, headers) {
  try {
    const body = await request.json();
    const { new_status_label, reason } = body;
    
    if (!new_status_label) return Response.json({ error: "new_status_label obrigatório" }, { status: 400, headers });

    const project = await env.HUBDB.prepare("SELECT id, status_id FROM projects WHERE id = ?").bind(id).first();
    if (!project) return Response.json({ error: "Projeto não encontrado" }, { status: 404, headers });

    const statusRes = await env.HUBDB.prepare("SELECT id FROM project_statuses WHERE label = ?")
      .bind(new_status_label).first();
    if (!statusRes) return Response.json({ error: "Status inválido" }, { status: 400, headers });

    const now = new Date().toISOString();

    await env.HUBDB.prepare("UPDATE projects SET status_id = ?, updated_at = ? WHERE id = ?")
      .bind(statusRes.id, now, id).run();

    await env.HUBDB.prepare(`
      INSERT INTO project_status_history (id, project_id, from_status_id, to_status_id, changed_at, reason, changed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), id, project.status_id, statusRes.id, now, reason || 'Atualização manual', 'admin').run();

    return Response.json({ success: true }, { headers });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers });
  }
}

async function handleChat(request, env, headers) {
  try {
    const { message, session_id, sender_role } = await request.json();
    if (!message) return Response.json({ error: "Mensagem vazia" }, { status: 400, headers });

    let currentSessionId = session_id;
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      await env.HUBDB.prepare("INSERT INTO chat_sessions (session_id, started_at, participant_tags) VALUES (?, ?, ?)")
        .bind(currentSessionId, new Date().toISOString(), 'user,ai_local').run();
    }

    const userMsgId = crypto.randomUUID();
    await env.HUBDB.prepare("INSERT INTO chat_messages (msg_id, session_id, sender_role, content, timestamp) VALUES (?, ?, ?, ?, ?)")
      .bind(userMsgId, currentSessionId, sender_role || 'user', message, new Date().toISOString()).run();

    // Resposta Local Inteligente (Sem custo)
    let aiResponse = "Entendi. Como posso ajudar? Posso listar seus projetos ou buscar informações específicas.";
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('listar') || lowerMsg.includes('projetos')) {
      const projects = await env.HUBDB.prepare("SELECT name, status_label FROM projects ORDER BY updated_at DESC LIMIT 5").all();
      if (projects.results.length > 0) {
        aiResponse = "Seus últimos projetos:\n";
        projects.results.forEach(p => aiResponse += `- ${p.name} (${p.status_label})\n`);
      } else {
        aiResponse = "Nenhum projeto cadastrado no momento.";
      }
    }

    const aiMsgId = crypto.randomUUID();
    await env.HUBDB.prepare("INSERT INTO chat_messages (msg_id, session_id, sender_role, content, timestamp) VALUES (?, ?, ?, ?, ?)")
      .bind(aiMsgId, currentSessionId, 'ai_local', aiResponse, new Date().toISOString()).run();

    return Response.json({ 
      success: true, 
      session_id: currentSessionId,
      reply: aiResponse 
    }, { headers });

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers });
  }
}
