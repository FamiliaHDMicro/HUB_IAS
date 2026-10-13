// ==========================================
// CONFIGURAÇÃO DA API (SEU WORKER REAL)
// ==========================================
const API_URL = '/api'; // Usa caminho relativo se hospedado no mesmo domínio/pages
let currentUserToken = localStorage.getItem('soc_br_token'); 

// Estado Global
let groups = [];
let currentGroupId = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    if (!currentUserToken) {
        UI.showAuth();
    } else {
        try {
            // Valida token no servidor
            const me = await Api.getMe();
            localStorage.setItem('soc_br_user_data', JSON.stringify(me));
            UI.showFeed();
            await loadFeedData();
        } catch (e) {
            console.warn("Token inválido/expirado.", e);
            localStorage.clear();
            UI.showAuth();
        }
    }
    
    // Checa se há parâmetro de convite na URL (?invite=xxx)
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if(inviteToken && document.getElementById('inviteTokenInput')) {
        setTimeout(() => {
            document.getElementById('inviteTokenInput').value = inviteToken;
            alert("Convite detectado! Clique em 'Aceitar Convite'.");
        }, 500);
    }
}

// --- FUNÇÕES AUXILIARES ---
function setTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
    localStorage.setItem('soc_br_theme', themeName);
}

function cycleTheme() {
    const themes = ['zumbi', 'kawaii', 'gamer', 'brasil'];
    const current = document.body.getAttribute('data-theme') || 'zumbi';
    const idx = themes.indexOf(current);
    const nextIdx = (idx + 1) % themes.length;
    setTheme(themes[nextIdx]);
}

// --- CAMADA DE COMUNICAÇÃO (FETCH) ---
const Api = {
    register: async (nome) => {
        const res = await fetch(`${API_URL}/registrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome })
        });
        return res.json();
    },
    getMe: async () => {
        const res = await fetch(`${API_URL}/eu`, {
            headers: { 'Authorization': `Bearer ${currentUserToken}` }
        });
        if(!res.ok) throw new Error('Unauthorized');
        return res.json();
    },
    listGroups: async () => {
        const res = await fetch(`${API_URL}/grupos`, {
            headers: { 'Authorization': `Bearer ${currentUserToken}` }
        });
        return res.json();
    },
    createGroup: async (nome, tipo) => {
        const res = await fetch(`${API_URL}/grupos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUserToken}` 
            },
            body: JSON.stringify({ nome, tipo })
        });
        return res.json();
    },
    generateInvite: async (groupId) => {
        const res = await fetch(`${API_URL}/grupos/${groupId}/convites`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentUserToken}` }
        });
        return res.json();
    },
    acceptInvite: async (token) => {
        const res = await fetch(`${API_URL}/convites/aceitar`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUserToken}` 
            },
            body: JSON.stringify({ token })
        });
        return res.json();
    }
};

// --- INTERFACE DO USUÁRIO (DOM MANIPULATION) ---
const UI = {
    elements: {},
    
    init() {
        this.cacheElements();
        this.bindEvents();
        this.applySavedTheme();
    },
    
    cacheElements() {
        this.elements = {
            themeBtn: document.getElementById('themeToggleBtn'),
            logoutBtn: document.getElementById('logoutBtn'),
            authScreen: document.getElementById('authScreen'),
            feedScreen: document.getElementById('feedScreen'),
            loginForm: document.getElementById('loginForm'),
            usernameInput: document.getElementById('usernameInput'),
            inviteInput: document.getElementById('inviteTokenInput'),
            joinInviteBtn: document.getElementById('joinWithInviteBtn'),
            
            tabsNav: document.querySelector('.tabs-nav'),
            tabPanes: document.querySelectorAll('.tab-pane'),
            mobileNavItems: document.querySelectorAll('.bottom-nav .nav-item'),
            
            groupsContainer: document.getElementById('groupsListContainer'),
            groupCountBadge: document.getElementById('groupCountBadge'),
            createGroupForm: document.getElementById('createGroupForm'),
            newGroupName: document.getElementById('newGroupName'),
            newGroupType: document.getElementById('newGroupType'),
            
            inviteTargetSelect: document.getElementById('inviteTargetGroup'),
            genInviteBtn: document.getElementById('generateInviteBtn'),
            inviteResultBox: document.getElementById('inviteResultBox'),
            generatedLinkCode: document.getElementById('generatedInviteLink'),
            copyInviteBtn: document.getElementById('copyInviteBtn'),
            
            profileName: document.getElementById('profileNameDisplay'),
            profileInitials: document.getElementById('profileInitials'),
            statGroups: document.getElementById('statGroupsJoined'),
            statPosts: document.getElementById('statPostsMade')
        };
    },
    
    bindEvents() {
        // Tema
        this.elements.themeBtn?.addEventListener('click', () => cycleTheme());
        
        // Logout
        this.elements.logoutBtn?.addEventListener('click', () => {
            if(confirm('Sair da conta?')) {
                localStorage.removeItem('soc_br_token');
                location.reload();
            }
        });
        
        // Login/Register
        this.elements.loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = this.elements.usernameInput.value.trim();
            if(!nome) return alert('Digite um nome.');
            
            try {
                const res = await Api.register(nome);
                if(res.token) {
                    currentUserToken = res.token;
                    localStorage.setItem('soc_br_token', currentUserToken);
                    this.showFeed();
                    await loadFeedData();
                } else {
                    throw new Error(res.erro || 'Falha ao registrar');
                }
            } catch(err) {
                alert('Erro: ' + err.message);
            }
        });
        
        // Aceitar Convite
        this.elements.joinInviteBtn?.addEventListener('click', async () => {
            const token = this.elements.inviteInput.value.trim();
            if(!token) return alert('Cole o token do convite.');
            
            try {
                const res = await Api.acceptInvite(token);
                if(res.ok) {
                    alert('Convite aceito! Bem-vindo ao grupo.');
                    this.elements.inviteInput.value = '';
                    await loadFeedData();
                } else {
                    throw new Error(res.erro);
                }
            } catch(err) {
                alert('Convite inválido ou expirado.');
            }
        });
        
        // Tabs Desktop
        this.elements.tabsNav?.addEventListener('click', (e) => {
            if(e.target.classList.contains('tab-btn')) {
                this.switchTab(e.target.dataset.target);
            }
        });
        
        // Criar Grupo
        this.elements.createGroupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = this.elements.newGroupName.value.trim();
            const tipo = this.elements.newGroupType.value;
            
            if(!nome) return alert('Dê um nome ao grupo.');
            
            try {
                const res = await Api.createGroup(nome, tipo);
                if(res.id) {
                    alert('Grupo criado com sucesso!');
                    this.elements.newGroupName.value = '';
                    await loadFeedData();
                } else {
                    throw new Error(res.erro);
                }
            } catch(err) {
                alert('Erro ao criar: ' + err.message);
            }
        });
        
        // Gerar Convite
        this.elements.genInviteBtn?.addEventListener('click', async () => {
            const gid = this.elements.inviteTargetSelect.value;
            if(!gid) return alert('Selecione um grupo.');
            
            try {
                const res = await Api.generateInvite(gid);
                if(res.token) {
                    const link = `${location.origin}?invite=${res.token}`;
                    this.elements.generatedLinkCode.textContent = link;
                    this.elements.inviteResultBox.classList.remove('hidden');
                } else {
                    throw new Error(res.erro);
                }
            } catch(err) {
                alert('Erro ao gerar convite.');
            }
        });
        
        this.elements.copyInviteBtn?.addEventListener('click', () => {
            navigator.clipboard.writeText(this.elements.generatedLinkCode.textContent);
            alert('Copiado!');
        });
    },
    
    applySavedTheme() {
        const saved = localStorage.getItem('soc_br_theme');
        if(saved) document.body.setAttribute('data-theme', saved);
    },
    
    switchTab(targetId) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.target === targetId));
        document.querySelectorAll('.tab-pane').forEach(p => {
            p.classList.toggle('active', p.id === targetId);
            p.classList.toggle('hidden', p.id !== targetId);
        });
        
        const tabIndex = Array.from(document.querySelectorAll('.tab-btn')).findIndex(b => b.dataset.target === targetId);
        if(tabIndex > -1 && this.elements.mobileNavItems[tabIndex]) {
             this.elements.mobileNavItems.forEach(n => n.classList.remove('active'));
             this.elements.mobileNavItems[tabIndex].classList.add('active');
        }
    },
    
    showAuth() {
        this.elements.feedScreen.classList.add('hidden');
        this.elements.feedScreen.classList.remove('active');
        this.elements.authScreen.classList.remove('hidden');
        this.elements.authScreen.classList.add('active');
        this.elements.logoutBtn?.classList.add('hidden');
    },
    
    showFeed() {
        this.elements.authScreen.classList.add('hidden');
        this.elements.authScreen.classList.remove('active');
        this.elements.feedScreen.classList.remove('hidden');
        this.elements.feedScreen.classList.add('active');
        this.elements.logoutBtn?.classList.remove('hidden');
    },
    
    renderGroups(list) {
        const container = this.elements.groupsContainer;
        const badge = this.elements.groupCountBadge;
        
        if(!list || list.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum grupo encontrado. Crie um novo!</div>';
            badge.textContent = '0 grupos';
            this.populateInviteDropdown([]);
            return;
        }
        
        badge.textContent = `${list.length} grupo(s)`;
        
        container.innerHTML = list.map(g => `
            <div class="group-card" onclick="App.viewGroup('${g.id}')">
                <div class="group-icon">${g.nome.charAt(0)}</div>
                <div class="group-info">
                    <h4>${g.nome}</h4>
                    <p>Status: ${g.meu_status || 'ativo'} • Tipo: ${g.tipo || 'aberto'}</p>
                </div>
                <span class="group-status">${g.membros || '?'} membros</span>
            </div>
        `).join('');
        
        this.populateInviteDropdown(list);
    },
    
    populateInviteDropdown(groups) {
        const select = this.elements.inviteTargetSelect;
        if(!select) return;
        
        select.innerHTML = '<option value="">Selecione um grupo...</option>' + 
            groups.filter(g => g.meu_status === 'ativo').map(g => 
                `<option value="${g.id}">${g.nome}</option>`
            ).join('');
    },
    
    updateProfile(userData, stats) {
        if(userData) {
            this.elements.profileName.textContent = userData.nome;
            this.elements.profileInitials.textContent = userData.nome.substring(0,2).toUpperCase();
        }
        if(stats) {
            this.elements.statGroups.textContent = stats.grupos || 0;
            this.elements.statPosts.textContent = stats.posts || 0;
        }
    }
};

// --- ORQUESTRAÇÃO PRINCIPAL ---
const App = {
    currentUser: null,
    currentGroups: [],
    
    async loadFeedData() {
        try {
            this.currentGroups = await Api.listGroups();
            UI.renderGroups(this.currentGroups);
            
            // Atualiza perfil básico
            const cachedUser = JSON.parse(localStorage.getItem('soc_br_user_data') || '{}');
            UI.updateProfile(cachedUser, { grupos: this.currentGroups.length, posts: 0 });
            
        } catch(e) {
            console.error("Erro ao carregar feed:", e);
            UI.elements.groupsContainer.innerHTML = '<div class="empty-state" style="color:red;">Erro de conexão. Tente recarregar.</div>';
        }
    },
    
    viewGroup(groupId) {
        // Futuramente navega para detalhes do grupo/posts
        alert(`Abrindo grupo ID: ${groupId}. Funcionalidade de Post/Chat em breve.`);
    }
};

// Executa quando o DOM estiver pronto
UI.init();