document.addEventListener('DOMContentLoaded', () => {

    let currentUser = null;
    let currentProjetoId = null;
    let currentProjetoNome = '';
    let chartInstance1 = null;
    let chartInstance2 = null;
    let relatorioProjetoId = null;

    const API = 'api.php';
    const loginScreen = document.getElementById('login-screen');
    const mainApp     = document.getElementById('main-app');
    const navLinks    = document.querySelectorAll('.nav-item[data-target]');
    const tabs        = document.querySelectorAll('.tab-content');

    // ─── MOBILE SIDEBAR ──────────────────────────────────────────────────
    const sidebar        = document.getElementById('sidebar');
    const menuToggle     = document.getElementById('menu-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function openSidebar()  { sidebar.classList.add('open'); sidebarOverlay.classList.add('show'); document.body.style.overflow = 'hidden'; }
    function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); document.body.style.overflow = ''; }
    menuToggle.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
    sidebarOverlay.addEventListener('click', closeSidebar);

    // ─── TOAST ───────────────────────────────────────────────────────────
    function toast(msg, tipo = 'success') {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.className   = `toast toast-${tipo} show`;
        setTimeout(() => el.classList.remove('show'), 3500);
    }

    // ─── MODAL ───────────────────────────────────────────────────────────
    function mostrarModal(html) {
        document.getElementById('modal-box').innerHTML = html;
        document.getElementById('modal-overlay').style.display = 'flex';
    }
    function fecharModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }
    window.fecharModal = fecharModal;
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
        if (e.target === this) fecharModal();
    });

    // ─── TOGGLE LOGIN / CADASTRO ──────────────────────────────────────────
    window.toggleAuth = function(e, modo) {
        if (e) e.preventDefault();
        const errEl = document.getElementById('login-error');
        if (errEl) errEl.style.display = 'none';
        document.getElementById('auth-login-box').style.display    = (modo === 'login')    ? 'block' : 'none';
        document.getElementById('auth-register-box').style.display = (modo === 'register') ? 'block' : 'none';
    };

    // ─── SESSÃO ──────────────────────────────────────────────────────────
    function salvarSessao(user) {
        localStorage.setItem('autoreq_session', JSON.stringify({ user, timestamp: Date.now() }));
    }
    function limparSessao() {
        localStorage.removeItem('autoreq_session');
    }
    function carregarSessao() {
        try {
            const raw = localStorage.getItem('autoreq_session');
            if (!raw) return null;
            const { user, timestamp } = JSON.parse(raw);
            if (Date.now() - timestamp > 8 * 3600 * 1000) { limparSessao(); return null; }
            return user;
        } catch { return null; }
    }

    // ─── HELPER: fetch com JSON ───────────────────────────────────────────
    async function apiFetch(url, options = {}) {
        const defaults = {
            headers: { 'Content-Type': 'application/json' },
        };
        const merged = { ...defaults, ...options };
        if (merged.headers) merged.headers = { ...defaults.headers, ...(options.headers || {}) };

        const resp = await fetch(url, merged);
        let data;
        try {
            data = await resp.json();
        } catch {
            throw new Error(`Resposta inválida do servidor (HTTP ${resp.status})`);
        }
        return { ok: resp.ok, status: resp.status, data };
    }

    // ─── INICIAR APP ──────────────────────────────────────────────────────
    function iniciarApp(user) {
        currentUser = user;
        const nome = user?.nome || 'Usuário';
        loginScreen.style.display = 'none';
        mainApp.style.display     = 'flex';
        document.getElementById('user-name').textContent   = nome;
        document.getElementById('user-role').textContent   = user?.papel || 'analista';
        document.getElementById('user-avatar').textContent = nome[0].toUpperCase();
        carregarEstatisticas();
    }

    // ─── BOOT ────────────────────────────────────────────────────────────
    const sessaoSalva = carregarSessao();
    if (sessaoSalva) {
        iniciarApp(sessaoSalva);
    } else {
        mainApp.style.display    = 'none';
        loginScreen.style.display = 'flex';
    }

    // ─── LOGIN ───────────────────────────────────────────────────────────
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const senha = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');
        const btnEl = e.submitter || e.target.querySelector('button[type="submit"]');

        errEl.style.display = 'none';
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...'; }

        try {
            const { ok, data } = await apiFetch(`${API}?action=login`, {
                method: 'POST',
                body: JSON.stringify({ email, senha }),
            });

            if (data.error) {
                errEl.textContent   = data.error;
                errEl.style.display = 'block';
            } else if (data.success && data.user) {
                salvarSessao(data.user);
                iniciarApp(data.user);
            } else {
                errEl.textContent   = 'Resposta inesperada do servidor.';
                errEl.style.display = 'block';
            }
        } catch (err) {
            errEl.textContent   = 'Não foi possível conectar ao servidor. Verifique sua conexão.';
            errEl.style.display = 'block';
            console.error('Erro de login:', err.message);
        } finally {
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar'; }
        }
    });

    // ─── CADASTRO (formulário nativo no HTML) ─────────────────────────────
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome  = document.getElementById('reg-nome').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const senha = document.getElementById('reg-password').value;
        const errEl = document.getElementById('login-error');
        const btnEl = e.submitter || e.target.querySelector('button[type="submit"]');

        errEl.style.display = 'none';
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...'; }

        if (!nome || !email || !senha) {
            errEl.textContent   = 'Preencha todos os campos.';
            errEl.style.display = 'block';
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-user-plus"></i> Criar Conta'; }
            return;
        }

        try {
            const { data } = await apiFetch(`${API}?action=cadastro`, {
                method: 'POST',
                body: JSON.stringify({ nome, email, senha }),
            });
            if (data.error) {
                errEl.textContent   = data.error;
                errEl.style.display = 'block';
            } else {
                toast('Conta criada! Faça login para continuar.');
                document.getElementById('register-form').reset();
                toggleAuth(null, 'login');
            }
        } catch {
            errEl.textContent   = 'Erro ao conectar ao servidor.';
            errEl.style.display = 'block';
        } finally {
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-user-plus"></i> Criar Conta'; }
        }
    });

    // ─── (mantido para compatibilidade com modal, se usado) ───────────────
    const cadastroLink = document.getElementById('register-link');
    if (cadastroLink) {
        cadastroLink.addEventListener('click', (e) => {
            e.preventDefault();
            mostrarModal(`
                <h3><i class="fas fa-user-plus" style="color:var(--primary);margin-right:8px;"></i>Criar Conta</h3>
                <div class="group" style="margin-top:16px;">
                    <label>Nome completo</label>
                    <input type="text" id="cad-nome" placeholder="Seu nome" autofocus>
                </div>
                <div class="group">
                    <label>E-mail</label>
                    <input type="email" id="cad-email" placeholder="voce@empresa.com">
                </div>
                <div class="group">
                    <label>Senha <small style="color:var(--sub)">(mínimo 6 caracteres)</small></label>
                    <input type="password" id="cad-senha" placeholder="••••••">
                </div>
                <p id="cad-error" style="color:var(--danger);font-size:.82rem;display:none;margin-top:4px;"></p>
                <div class="btn-group" style="justify-content:flex-end;margin-top:16px;">
                    <button class="btn btn-secondary" onclick="fecharModal()"><i class="fas fa-times"></i> Cancelar</button>
                    <button class="btn btn-primary" onclick="enviarCadastro()"><i class="fas fa-user-plus"></i> Cadastrar</button>
                </div>
            `);
        });
    }

    window.enviarCadastro = async () => {
        const nome  = document.getElementById('cad-nome')?.value.trim();
        const email = document.getElementById('cad-email')?.value.trim();
        const senha = document.getElementById('cad-senha')?.value;
        const errEl = document.getElementById('cad-error');

        if (!nome || !email || !senha) {
            errEl.textContent   = 'Preencha todos os campos.';
            errEl.style.display = 'block';
            return;
        }

        try {
            const { data } = await apiFetch(`${API}?action=cadastro`, {
                method: 'POST',
                body: JSON.stringify({ nome, email, senha }),
            });

            if (data.error) {
                errEl.textContent   = data.error;
                errEl.style.display = 'block';
            } else {
                fecharModal();
                toast('Conta criada! Faça login para continuar.');
            }
        } catch {
            errEl.textContent   = 'Erro ao conectar ao servidor.';
            errEl.style.display = 'block';
        }
    };

    // ─── LOGOUT ──────────────────────────────────────────────────────────
    function fazerLogout() {
        limparSessao();
        window.location.reload();
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fazerLogout();
        });
    }

    // ─── PERFIL DROPDOWN ─────────────────────────────────────────────────
    const avatarEl        = document.getElementById('user-avatar');
    const profileDropdown = document.getElementById('profile-dropdown');

    function openProfileDropdown() {
        profileDropdown.classList.add('show');
        avatarEl.setAttribute('aria-expanded', 'true');
    }

    function closeProfileDropdown() {
        profileDropdown.classList.remove('show');
        avatarEl.setAttribute('aria-expanded', 'false');
    }

    function toggleProfileDropdown() {
        if (profileDropdown.classList.contains('show')) {
            closeProfileDropdown();
        } else {
            openProfileDropdown();
        }
    }

    // Abre/fecha ao clicar no avatar
    avatarEl.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProfileDropdown();
    });

    // Abre/fecha com teclado (Enter / Espaço / Esc)
    avatarEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleProfileDropdown();
        } else if (e.key === 'Escape') {
            closeProfileDropdown();
        }
    });

    // Fechar ao clicar fora do dropdown
    document.addEventListener('click', (e) => {
        if (
            profileDropdown.classList.contains('show') &&
            !profileDropdown.contains(e.target) &&
            e.target !== avatarEl
        ) {
            closeProfileDropdown();
        }
    });

    // Botão "Configurar Conta" no dropdown → abre o drawer de perfil
    document.getElementById('dropdown-config-conta').addEventListener('click', () => {
        closeProfileDropdown();
        window.abrirPerfilDrawer();
    });

    // Botão "Sair" no dropdown → mesmo comportamento que o botão da sidebar
    document.getElementById('dropdown-logout').addEventListener('click', () => {
        closeProfileDropdown();
        fazerLogout();
    });

    // ─── RECUPERAÇÃO DE SENHA ─────────────────────────────────────────────
    document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        mostrarModal(`
            <h3><i class="fas fa-key" style="color:var(--primary);margin-right:8px;"></i>Recuperar Senha</h3>
            <p style="color:var(--sub);font-size:.85rem;margin:12px 0 20px;">Insira seu e-mail para receber o link de redefinição.</p>
            <div class="group">
                <label>E-mail institucional</label>
                <input type="email" id="forgot-email" placeholder="dev@empresa.com" autofocus>
            </div>
            <div class="btn-group" style="justify-content:flex-end;margin-top:8px;">
                <button class="btn btn-secondary" onclick="fecharModal()"><i class="fas fa-times"></i> Cancelar</button>
                <button class="btn btn-primary" onclick="enviarRecuperacao()"><i class="fas fa-paper-plane"></i> Enviar</button>
            </div>
        `);
    });

    window.enviarRecuperacao = () => {
        const email = document.getElementById('forgot-email')?.value?.trim();
        if (!email) { toast('Informe um e-mail.', 'error'); return; }
        fecharModal();
        toast(`Link de recuperação enviado para ${email}`);
    };

    // ─── NAVEGAÇÃO ────────────────────────────────────────────────────────
    const breadcrumbLabel = document.getElementById('breadcrumb-label');
    const pageLabels = {
        dashboard: 'Dashboard', projetos: 'Projetos', requisitos: 'Requisitos',
        uml: 'Diagramas UML', relatorios: 'Relatórios'
    };

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            tabs.forEach(t => t.classList.remove('active'));
            document.getElementById(target)?.classList.add('active');
            breadcrumbLabel.innerHTML = `<strong>${pageLabels[target] || target}</strong>`;
            if (target === 'projetos')   carregarListaProjetos();
            if (target === 'requisitos') atualizarSelectsProjetos();
            if (target === 'relatorios') atualizarSelectsProjetos();
            if (target === 'uml')        atualizarSelectsProjetos();
            if (target === 'dashboard')  carregarEstatisticas();
            closeSidebar();
        });
    });

    // ─── SELECTS DE PROJETO ───────────────────────────────────────────────
    async function atualizarSelectsProjetos() {
        try {
            const { data: projs } = await apiFetch(`${API}?tipo=projetos&usuario_id=${currentUser?.id || 0}`);
            if (!Array.isArray(projs)) return;
            const options = '<option value="">Selecione um projeto...</option>' +
                projs.map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');

            // Selects comuns
            ['req-projeto-vinculo', 'relatorio-projeto-select']
                .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = options; });

            // Select UML: preserva seleção anterior e notifica o módulo
            const umlSel = document.getElementById('uml-projeto-select');
            if (umlSel) {
                const prevVal = umlSel.value;
                umlSel.innerHTML = '<option value="">Escolha um projeto para gerenciar diagramas...</option>' +
                    projs.map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');
                if (prevVal && umlSel.querySelector(`option[value="${prevVal}"]`)) {
                    umlSel.value = prevVal;
                }
                // Notifica o módulo UML com o valor atual (seja preservado ou vazio)
                if (typeof window.umlSetProjeto === 'function') {
                    window.umlSetProjeto(umlSel.value);
                }
            }
        } catch (err) { console.error('atualizarSelectsProjetos:', err); }
    }

    document.getElementById('relatorio-projeto-select').addEventListener('change', e => {
        relatorioProjetoId = e.target.value;
        document.getElementById('export-card').style.display = e.target.value ? 'block' : 'none';
        gerarRelatorios(e.target.value);
    });

    // ─── BADGE / ICONS ────────────────────────────────────────────────────
    function badge(status) {
        const map = {
            'Pendente': 'badge-warning', 'Aprovado': 'badge-success',
            'Revisão': 'badge-info',     'Ativo': 'badge-success',
            'Planejamento': 'badge-warning', 'Concluído': 'badge-success',
            'Cancelado': 'badge-danger'
        };
        return `<span class="badge ${map[status] || 'badge-warning'}">${status}</span>`;
    }
    function prioridadeIcon(p) {
        const map = { 'Alta': '🔴', 'Média': '🟡', 'Baixa': '🟢' };
        return `${map[p] || ''} ${p}`;
    }

    // ─── [RF01] PROJETOS ──────────────────────────────────────────────────
    document.getElementById('form-projeto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('proj-edit-id').value;
        const dados  = {
            nome_projeto: document.getElementById('proj-nome').value.trim(),
            cliente:      document.getElementById('proj-cliente').value.trim(),
            status:       document.getElementById('proj-status').value,
            desc:         document.getElementById('proj-desc').value.trim(),
            usuario_id:   currentUser?.id || 0
        };
        if (!dados.nome_projeto || !dados.cliente) { toast('Preencha os campos obrigatórios.', 'error'); return; }

        try {
            if (editId) {
                dados.projeto_id = editId;
                const { data } = await apiFetch(API, { method: 'PUT', body: JSON.stringify(dados) });
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Projeto atualizado com sucesso!');
                cancelarEdicaoProjeto();
            } else {
                const { data } = await apiFetch(API, { method: 'POST', body: JSON.stringify(dados) });
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Projeto criado com sucesso!');
            }
            document.getElementById('form-projeto').reset();
            carregarListaProjetos();
        } catch { toast('Erro ao salvar projeto. Verifique sua conexão.', 'error'); }
    });

    async function carregarListaProjetos() {
        const tbody = document.querySelector('#table-projetos tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
        try {
            const { data: projs } = await apiFetch(`${API}?tipo=projetos&usuario_id=${currentUser?.id || 0}`);
            if (!Array.isArray(projs) || !projs.length) {
                tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="fas fa-folder-open"></i><p>Nenhum projeto cadastrado. Crie um acima.</p></div></td></tr>`;
                return;
            }
            tbody.innerHTML = projs.map(p => `
                <tr>
                    <td><strong>${escHtml(p.nome)}</strong>${p.descricao ? `<br><small style="color:var(--sub)">${escHtml(p.descricao)}</small>` : ''}</td>
                    <td>${escHtml(p.cliente || '–')}</td>
                    <td>${badge(p.status)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-primary" title="Ver requisitos" onclick="verProjeto(${p.id},'${escHtml(p.nome)}')">
                                <i class="fas fa-eye"></i></button>
                            <button class="btn btn-sm btn-secondary" title="Editar" onclick="editarProjeto(${p.id},'${escHtml(p.nome)}','${escHtml(p.cliente||'')}','${escHtml(p.status)}','${escHtml(p.descricao||'')}')">
                                <i class="fas fa-pencil"></i></button>
                            <button class="btn btn-sm btn-danger" title="Excluir" onclick="confirmarExclusaoProjeto(${p.id},'${escHtml(p.nome)}')">
                                <i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('');
        } catch { tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Erro ao carregar projetos. Verifique sua conexão.</td></tr>'; }
    }

    window.editarProjeto = (id, nome, cliente, status, desc) => {
        document.getElementById('proj-edit-id').value  = id;
        document.getElementById('proj-nome').value     = nome;
        document.getElementById('proj-cliente').value  = cliente;
        document.getElementById('proj-status').value   = status;
        document.getElementById('proj-desc').value     = desc;
        document.getElementById('proj-btn-submit').innerHTML        = '<i class="fas fa-save"></i> Salvar Alterações';
        document.getElementById('proj-btn-cancelar').style.display  = 'inline-flex';
        document.getElementById('proj-form-title').innerHTML        = '<i class="fas fa-pencil"></i> Editar Projeto';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.cancelarEdicaoProjeto = () => {
        document.getElementById('proj-edit-id').value = '';
        document.getElementById('form-projeto').reset();
        document.getElementById('proj-btn-submit').innerHTML        = '<i class="fas fa-save"></i> Criar Projeto';
        document.getElementById('proj-btn-cancelar').style.display  = 'none';
        document.getElementById('proj-form-title').innerHTML        = '<i class="fas fa-plus-circle"></i> Novo Projeto';
    };

    window.confirmarExclusaoProjeto = (id, nome) => {
        mostrarModal(`
            <h3><i class="fas fa-triangle-exclamation" style="color:var(--danger);margin-right:8px;"></i>Excluir Projeto</h3>
            <p style="margin:16px 0;">Tem certeza que deseja excluir <strong>${nome}</strong>?</p>
            <p style="color:var(--sub);font-size:.82rem;">Todos os requisitos e comentários vinculados serão removidos permanentemente.</p>
            <div class="btn-group" style="justify-content:flex-end;margin-top:24px;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-danger" onclick="excluirProjeto(${id})"><i class="fas fa-trash"></i> Excluir</button>
            </div>`);
    };

    window.excluirProjeto = async (id) => {
        fecharModal();
        try {
            const { data } = await apiFetch(`${API}?action=projeto&id=${id}&usuario_id=${currentUser?.id || 0}`, { method: 'DELETE' });
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Projeto excluído!');
            carregarListaProjetos();
        } catch { toast('Erro ao excluir projeto.', 'error'); }
    };

    // ─── [RF02] REQUISITOS ────────────────────────────────────────────────
    document.getElementById('form-requisito').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('req-edit-id').value;
        const dados  = {
            projeto_id:          document.getElementById('req-projeto-vinculo').value,
            id_requisito_manual: document.getElementById('req-id').value.trim(),
            tipo:                document.getElementById('req-tipo').value,
            prioridade:          document.getElementById('req-prioridade').value,
            titulo:              document.getElementById('req-titulo').value.trim(),
            desc:                document.getElementById('req-desc').value.trim(),
            usuario_id:          currentUser?.id || 0
        };

        if (!dados.projeto_id)           { toast('Selecione um projeto.', 'error'); return; }
        if (!dados.id_requisito_manual)  { toast('Informe o código do requisito.', 'error'); return; }
        if (!dados.titulo)               { toast('Informe o título do requisito.', 'error'); return; }

        try {
            if (editId) {
                const putDados = {
                    req_id: editId, codigo: dados.id_requisito_manual,
                    tipo: dados.tipo, titulo: dados.titulo,
                    desc: dados.desc, prioridade: dados.prioridade,
                    usuario_id: currentUser?.id || 0
                };
                const { data } = await apiFetch(API, { method: 'PUT', body: JSON.stringify(putDados) });
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Requisito atualizado!');
                cancelarEdicaoReq();
            } else {
                const { data } = await apiFetch(API, { method: 'POST', body: JSON.stringify(dados) });
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Requisito cadastrado com sucesso!');
            }
            document.getElementById('form-requisito').reset();
        } catch { toast('Erro ao salvar requisito. Verifique sua conexão.', 'error'); }
    });

    window.cancelarEdicaoReq = () => {
        document.getElementById('req-edit-id').value = '';
        document.getElementById('form-requisito').reset();
        document.getElementById('req-btn-submit').innerHTML       = '<i class="fas fa-save"></i> Salvar Requisito';
        document.getElementById('req-btn-cancelar').style.display = 'none';
        document.getElementById('req-form-title').innerHTML       = '<i class="fas fa-plus-circle"></i> Cadastrar Requisito';
    };

    // ─── [RF04] DETALHES DO PROJETO ───────────────────────────────────────
    window.verProjeto = async (id, nome) => {
        currentProjetoId   = id;
        currentProjetoNome = nome;
        document.getElementById('view-projeto-nome').textContent = nome;
        document.getElementById('filtro-tipo').value       = '';
        document.getElementById('filtro-prioridade').value = '';
        document.getElementById('filtro-status').value     = '';
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('detalhes-projeto').classList.add('active');
        breadcrumbLabel.innerHTML = `<strong>${escHtml(nome)}</strong>`;
        await carregarRequisitosDetalhes(id);
    };

    async function carregarRequisitosDetalhes(projId, filtros = {}) {
        const tbody = document.querySelector('#table-requisitos-projeto tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="empty-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

        let url = `${API}?tipo=requisitos&projeto_id=${projId}&usuario_id=${currentUser?.id || 0}`;
        if (filtros.tipo)       url += `&filtro_tipo=${filtros.tipo}`;
        if (filtros.status)     url += `&filtro_status=${filtros.status}`;
        if (filtros.prioridade) url += `&filtro_prioridade=${filtros.prioridade}`;

        try {
            const { data: reqs } = await apiFetch(url);
            if (!Array.isArray(reqs) || !reqs.length) {
                tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Nenhum requisito encontrado para este projeto.</p></div></td></tr>`;
                return;
            }
            tbody.innerHTML = reqs.map(r => `
                <tr>
                    <td><code>${escHtml(r.codigo)}</code></td>
                    <td>${escHtml(r.titulo)}</td>
                    <td><span class="badge badge-info">${escHtml(r.tipo)}</span></td>
                    <td>${prioridadeIcon(r.prioridade)}</td>
                    <td>${badge(r.status)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-secondary" title="Editar"
                                onclick="editarRequisito(${r.id},'${escHtml(r.codigo)}','${escHtml(r.tipo)}','${escHtml(r.titulo)}','${escHtml(r.descricao||'')}','${escHtml(r.prioridade)}')">
                                <i class="fas fa-pencil"></i></button>
                            <button class="btn btn-sm btn-success" title="Aprovar"
                                onclick="validarRequisito(${r.id},'Aprovado')" ${r.status==='Aprovado'?'disabled':''}>
                                <i class="fas fa-check"></i></button>
                            <button class="btn btn-sm btn-warning" title="Solicitar Revisão"
                                onclick="abrirRevisao(${r.id})" ${r.status==='Revisão'?'disabled':''}>
                                <i class="fas fa-rotate"></i></button>
                            <button class="btn btn-sm btn-info" title="Comentários"
                                onclick="abrirComentarios(${r.id},'${escHtml(r.titulo)}')">
                                <i class="fas fa-comments"></i></button>
                            <button class="btn btn-sm btn-danger" title="Excluir"
                                onclick="confirmarExclusaoReq(${r.id},'${escHtml(r.titulo)}')">
                                <i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('');
        } catch {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Erro ao carregar requisitos. Verifique sua conexão.</td></tr>';
        }
    }

    window.aplicarFiltros = () => {
        if (!currentProjetoId) return;
        carregarRequisitosDetalhes(currentProjetoId, {
            tipo:       document.getElementById('filtro-tipo').value,
            status:     document.getElementById('filtro-status').value,
            prioridade: document.getElementById('filtro-prioridade').value
        });
    };

    window.voltarProjetos = () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('projetos').classList.add('active');
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('.nav-item[data-target="projetos"]').classList.add('active');
        breadcrumbLabel.innerHTML = '<strong>Projetos</strong>';
        carregarListaProjetos();
    };

    window.editarRequisito = (id, codigo, tipo, titulo, desc, prioridade) => {
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('requisitos').classList.add('active');
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('.nav-item[data-target="requisitos"]').classList.add('active');
        breadcrumbLabel.innerHTML = '<strong>Requisitos</strong>';

        atualizarSelectsProjetos().then(() => {
            document.getElementById('req-edit-id').value    = id;
            document.getElementById('req-id').value         = codigo;
            document.getElementById('req-tipo').value       = tipo;
            document.getElementById('req-titulo').value     = titulo;
            document.getElementById('req-desc').value       = desc;
            document.getElementById('req-prioridade').value = prioridade;
            document.getElementById('req-btn-submit').innerHTML       = '<i class="fas fa-save"></i> Salvar Alterações';
            document.getElementById('req-btn-cancelar').style.display = 'inline-flex';
            document.getElementById('req-form-title').innerHTML       = '<i class="fas fa-pencil"></i> Editar Requisito';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    };

    window.confirmarExclusaoReq = (id, titulo) => {
        mostrarModal(`
            <h3><i class="fas fa-triangle-exclamation" style="color:var(--danger);margin-right:8px;"></i>Excluir Requisito</h3>
            <p style="margin:16px 0;">Deseja excluir o requisito <strong>${titulo}</strong>?</p>
            <div class="btn-group" style="justify-content:flex-end;margin-top:24px;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-danger" onclick="excluirRequisito(${id})"><i class="fas fa-trash"></i> Excluir</button>
            </div>`);
    };

    window.excluirRequisito = async (id) => {
        fecharModal();
        try {
            const { data } = await apiFetch(`${API}?action=requisito&id=${id}&usuario_id=${currentUser?.id || 0}`, { method: 'DELETE' });
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Requisito excluído!');
            carregarRequisitosDetalhes(currentProjetoId);
        } catch { toast('Erro ao excluir requisito.', 'error'); }
    };

    // ─── [RF05] VALIDAÇÃO ─────────────────────────────────────────────────
    window.validarRequisito = async (id, novoStatus, justificativa = '') => {
        try {
            const { data } = await apiFetch(API, {
                method: 'PUT',
                body: JSON.stringify({ requisito_id: id, novo_status: novoStatus, justificativa, usuario_id: currentUser?.id || 0 }),
            });
            if (data.error) { toast(data.error, 'error'); return; }
            toast(`Requisito marcado como: ${novoStatus}`);
            carregarRequisitosDetalhes(currentProjetoId);
        } catch { toast('Erro ao validar requisito.', 'error'); }
    };

    window.abrirRevisao = (id) => {
        mostrarModal(`
            <h3><i class="fas fa-rotate" style="color:var(--warning);margin-right:8px;"></i>Solicitar Revisão</h3>
            <p style="color:var(--sub);font-size:.85rem;margin:12px 0 16px;">Adicione uma justificativa para a revisão:</p>
            <div class="group">
                <label>Justificativa</label>
                <textarea id="revisao-justificativa" rows="4" placeholder="Descreva o motivo da revisão..."></textarea>
            </div>
            <div class="btn-group" style="justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-warning" onclick="confirmarRevisao(${id})"><i class="fas fa-rotate"></i> Solicitar</button>
            </div>`);
    };

    window.confirmarRevisao = (id) => {
        const just = document.getElementById('revisao-justificativa').value.trim();
        fecharModal();
        validarRequisito(id, 'Revisão', just);
    };

    // ─── [RF07] COMENTÁRIOS ───────────────────────────────────────────────
    window.abrirComentarios = async (reqId, titulo) => {
        try {
            const { data: comentarios } = await apiFetch(`${API}?tipo=comentarios&requisito_id=${reqId}`);
            const lista = Array.isArray(comentarios) && comentarios.length
                ? comentarios.map(c => `
                    <div class="comentario">
                        <div class="comentario-header">
                            <strong>${escHtml(c.autor)}</strong>
                            <small>${c.criado_em || ''}</small>
                        </div>
                        <p>${escHtml(c.texto)}</p>
                    </div>`).join('')
                : '<p class="empty-msg">Nenhum comentário ainda.</p>';

            mostrarModal(`
                <h3><i class="fas fa-comments" style="color:var(--primary);margin-right:8px;"></i>${escHtml(titulo)}</h3>
                <div id="lista-comentarios" style="max-height:280px;overflow-y:auto;margin:16px 0 12px;">${lista}</div>
                <div class="group">
                    <label>Novo comentário</label>
                    <textarea id="novo-comentario" rows="3" placeholder="Digite seu comentário..."></textarea>
                </div>
                <div class="btn-group" style="justify-content:flex-end;">
                    <button class="btn btn-secondary" onclick="fecharModal()"><i class="fas fa-times"></i> Fechar</button>
                    <button class="btn btn-primary" onclick="salvarComentario(${reqId})"><i class="fas fa-paper-plane"></i> Enviar</button>
                </div>`);
        } catch { toast('Erro ao carregar comentários.', 'error'); }
    };

    window.salvarComentario = async (reqId) => {
        const texto = document.getElementById('novo-comentario')?.value?.trim();
        if (!texto) { toast('Escreva um comentário antes de enviar.', 'error'); return; }
        try {
            const { data } = await apiFetch(`${API}?action=comentario`, {
                method: 'POST',
                body: JSON.stringify({ requisito_id: reqId, autor: currentUser?.nome || 'Usuário', texto }),
            });
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Comentário salvo!');
            fecharModal();
        } catch { toast('Erro ao salvar comentário.', 'error'); }
    };

    // ─── [RF06] EXPORTAR ERS ──────────────────────────────────────────────
    window.exportarERS = async (formato) => {
        if (!relatorioProjetoId) { toast('Selecione um projeto.', 'error'); return; }
        try {
            const [rProj, rReqs] = await Promise.all([
                apiFetch(`${API}?tipo=projetos&usuario_id=${currentUser?.id || 0}`),
                apiFetch(`${API}?tipo=requisitos&projeto_id=${relatorioProjetoId}&usuario_id=${currentUser?.id || 0}`)
            ]);
            const projs   = rProj.data;
            const reqs    = rReqs.data;
            const projeto = Array.isArray(projs) ? projs.find(p => p.id == relatorioProjetoId) : null;

            if (!Array.isArray(reqs) || !reqs.length) { toast('Nenhum requisito encontrado para exportar.', 'error'); return; }

            const dataHoje    = new Date().toLocaleDateString('pt-BR');
            const nomeProjeto = projeto?.nome || 'Projeto';

            if (formato === 'md') {
                let md = `# Documento de Requisitos de Software (ERS)\n\n`;
                md += `**Projeto:** ${nomeProjeto}\n**Cliente:** ${projeto?.cliente || '–'}\n`;
                md += `**Data:** ${dataHoje}\n**Status:** ${projeto?.status || '–'}\n\n---\n\n## Requisitos\n\n`;
                reqs.forEach(r => {
                    md += `### [${r.codigo}] ${r.titulo}\n`;
                    md += `- **Tipo:** ${r.tipo}\n- **Prioridade:** ${r.prioridade}\n- **Status:** ${r.status}\n`;
                    md += `- **Descrição:** ${r.descricao || '_Sem descrição._'}\n\n`;
                });
                downloadBlob(new Blob([md], { type: 'text/markdown' }), `ERS_${nomeProjeto.replace(/\s/g,'_')}.md`);
                toast('Markdown gerado e baixado!');
            } else {
                const rfList  = reqs.filter(r => r.tipo === 'RF');
                const rnfList = reqs.filter(r => r.tipo === 'RNF');
                const gerarSecao = lista => lista.map(r => `
                    <div style="margin-bottom:14px;padding:12px;border:1px solid #ddd;border-radius:6px;">
                        <strong>[${r.codigo}] ${r.titulo}</strong>
                        <table style="width:100%;margin-top:8px;font-size:.82rem;">
                            <tr><td><b>Prioridade:</b> ${r.prioridade}</td><td><b>Status:</b> ${r.status}</td></tr>
                        </table>
                        <p style="margin-top:8px;">${r.descricao || '<em>Sem descrição.</em>'}</p>
                    </div>`).join('');
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
                    <title>ERS – ${nomeProjeto}</title>
                    <style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{color:#1e5ba0}</style>
                    </head><body>
                    <h1>Documento ERS</h1>
                    <p><b>Projeto:</b> ${nomeProjeto} &nbsp;|&nbsp; <b>Cliente:</b> ${projeto?.cliente || '–'} &nbsp;|&nbsp; <b>Data:</b> ${dataHoje}</p>
                    <hr>
                    <h2>Requisitos Funcionais (RF)</h2>${gerarSecao(rfList) || '<p>Nenhum.</p>'}
                    <h2>Requisitos Não Funcionais (RNF)</h2>${gerarSecao(rnfList) || '<p>Nenhum.</p>'}
                    <script>window.onload=()=>{window.print();};<\/script></body></html>`;
                const win = window.open('', '_blank');
                if (win) { win.document.write(html); win.document.close(); }
                toast('PDF aberto na janela de impressão!');
            }
        } catch { toast('Erro ao exportar ERS.', 'error'); }
    };

    function downloadBlob(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ─── [RF04] RELATÓRIOS ────────────────────────────────────────────────
    async function gerarRelatorios(projId) {
        if (!projId) return;
        try {
            const { data: reqs } = await apiFetch(`${API}?tipo=requisitos&projeto_id=${projId}&usuario_id=${currentUser?.id || 0}`);
            if (!Array.isArray(reqs)) return;
            const rf = reqs.filter(r => r.tipo === 'RF').length;
            const rnf = reqs.filter(r => r.tipo === 'RNF').length;
            const alta  = reqs.filter(r => r.prioridade === 'Alta').length;
            const media = reqs.filter(r => r.prioridade === 'Média').length;
            const baixa = reqs.filter(r => r.prioridade === 'Baixa').length;

            if (chartInstance1) chartInstance1.destroy();
            if (chartInstance2) chartInstance2.destroy();

            chartInstance1 = new Chart(document.getElementById('chartRequisitos'), {
                type: 'doughnut',
                data: { labels: ['Funcionais (RF)', 'Não Funcionais (RNF)'], datasets: [{ data: [rf, rnf], backgroundColor: ['#2563eb', '#10b981'], borderWidth: 0 }] },
                options: { plugins: { legend: { position: 'bottom' } }, cutout: '65%' }
            });
            chartInstance2 = new Chart(document.getElementById('chartCategorias'), {
                type: 'bar',
                data: { labels: ['Alta', 'Média', 'Baixa'], datasets: [{ label: 'Requisitos por Prioridade', data: [alta, media, baixa], backgroundColor: ['#ef4444', '#f59e0b', '#10b981'], borderRadius: 6 }] },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
        } catch { console.error('Erro ao gerar relatórios'); }
    }

    // ─── DASHBOARD ────────────────────────────────────────────────────────
    async function carregarEstatisticas() {
        try {
            const uid = currentUser?.id || 0;
            // Usa a rota de dashboard dedicada quando disponível, com fallback para as rotas individuais
            const { data: stats } = await apiFetch(`${API}?tipo=dashboard&usuario_id=${uid}`);

            if (stats && typeof stats.requisitos !== 'undefined') {
                document.getElementById('stat-req').textContent   = stats.requisitos;
                document.getElementById('stat-proj').textContent  = stats.projetos;
                document.getElementById('stat-pend').textContent  = stats.pendentes;
                document.getElementById('stat-aprov').textContent = stats.aprovados;
            } else {
                // Fallback: busca individual
                const [rReq, rProj] = await Promise.all([
                    apiFetch(`${API}?tipo=requisitos&usuario_id=${uid}`),
                    apiFetch(`${API}?tipo=projetos&usuario_id=${uid}`)
                ]);
                const reqs  = rReq.data;
                const projs = rProj.data;
                document.getElementById('stat-req').textContent   = Array.isArray(reqs)  ? reqs.length  : 0;
                document.getElementById('stat-proj').textContent  = Array.isArray(projs) ? projs.length : 0;
                document.getElementById('stat-pend').textContent  = Array.isArray(reqs)  ? reqs.filter(r => r.status === 'Pendente').length : 0;
                document.getElementById('stat-aprov').textContent = Array.isArray(reqs)  ? reqs.filter(r => r.status === 'Aprovado').length : 0;
            }
        } catch { console.error('Erro ao carregar estatísticas'); }
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    }

    window.cancelarEdicaoProjeto = cancelarEdicaoProjeto;
    window.cancelarEdicaoReq     = cancelarEdicaoReq;

    // ═══════════════════════════════════════════════════════════════════════
    // MÓDULO: ANEXAR DIAGRAMAS EXTERNOS
    // Encapsulado em IIFE — acessa toast(), mostrarModal(), fecharModal(),
    // escHtml() do closure externo sem criar variáveis globais desnecessárias.
    // Apenas 3 funções expostas em window._diagrams* (prefixo evita colisões).
    // ═══════════════════════════════════════════════════════════════════════
    (function initDiagramsAttach() {

        // ── Configuração ──────────────────────────────────────────────────
        const DIAGRAMS_ALLOWED_EXT   = new Set(['drawio', 'svg', 'png', 'jpg', 'jpeg', 'pdf', 'xml']);
        const DIAGRAMS_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

        /**
         * Store da sessão: Array<{ id:string, file:File, objectUrl:string|null }>
         * Escopo restrito ao IIFE — não vaza para window.
         */
        const _diagramStore = [];

        // ── Referências ao DOM (via getter para sobreviver re-renders) ──────
        const _dz       = () => document.getElementById('diagrams-dropzone');
        const _input    = () => document.getElementById('diagrams-file-input');
        const _list     = () => document.getElementById('diagrams-list');
        const _emptyMsg = () => document.getElementById('diagrams-empty-msg');

        // ── Helpers ───────────────────────────────────────────────────────

        function _ext(filename) {
            return filename.split('.').pop().toLowerCase();
        }

        function _iconMeta(ext) {
            const map = {
                drawio: { cls: 'type-drawio', fa: 'fa-diagram-project' },
                svg:    { cls: 'type-svg',    fa: 'fa-bezier-curve'    },
                png:    { cls: 'type-image',  fa: 'fa-image'           },
                jpg:    { cls: 'type-image',  fa: 'fa-image'           },
                jpeg:   { cls: 'type-image',  fa: 'fa-image'           },
                pdf:    { cls: 'type-pdf',    fa: 'fa-file-pdf'        },
                xml:    { cls: 'type-xml',    fa: 'fa-code'            },
            };
            return map[ext] || { cls: 'type-other', fa: 'fa-file' };
        }

        function _formatSize(bytes) {
            if (bytes < 1024)           return `${bytes} B`;
            if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }

        function _uid() {
            return `dg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        }

        // ── Validação ─────────────────────────────────────────────────────

        function _validate(file) {
            const ext = _ext(file.name);
            if (!DIAGRAMS_ALLOWED_EXT.has(ext))
                return { ok: false, reason: `Extensão .${ext} não suportada.` };
            if (file.size > DIAGRAMS_MAX_SIZE_BYTES)
                return { ok: false, reason: `"${file.name}" excede o limite de 10 MB.` };
            if (_diagramStore.some(d => d.file.name === file.name))
                return { ok: false, reason: `"${file.name}" já foi anexado.` };
            return { ok: true };
        }

        // ── Renderização ──────────────────────────────────────────────────

        function _createItemEl(entry) {
            const { id, file } = entry;
            const ext  = _ext(file.name);
            const icon = _iconMeta(ext);
            const isPreviewable = ['png', 'jpg', 'jpeg', 'svg'].includes(ext);

            const el = document.createElement('div');
            el.className   = 'diagram-item';
            el.dataset.did = id;
            el.innerHTML = `
                <div class="diagram-item-icon ${escHtml(icon.cls)}">
                    <i class="fas ${escHtml(icon.fa)}"></i>
                </div>
                <div class="diagram-item-meta">
                    <div class="diagram-item-name" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
                    <div class="diagram-item-size">${escHtml(_formatSize(file.size))} &middot; .${escHtml(ext.toUpperCase())}</div>
                </div>
                <div class="diagram-item-actions">
                    ${isPreviewable
                        ? `<button class="btn btn-sm btn-info" title="Pré-visualizar"
                                   onclick="window._diagramsPreview('${id}')">
                               <i class="fas fa-eye"></i>
                           </button>`
                        : ''}
                    <button class="btn btn-sm btn-secondary" title="Baixar"
                            onclick="window._diagramsDownload('${id}')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" title="Remover"
                            onclick="window._diagramsRemove('${id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;
            return el;
        }

        function _syncEmptyState() {
            const el = _emptyMsg();
            if (el) el.style.display = _diagramStore.length === 0 ? '' : 'none';
        }

        // ── Operações Públicas ────────────────────────────────────────────

        function _processFiles(files) {
            let added = 0;
            const listEl = _list();
            if (!listEl) return;

            Array.from(files).forEach(file => {
                const check = _validate(file);
                if (!check.ok) {
                    // toast() herdado do closure DOMContentLoaded (linha ~27)
                    toast(`Arquivo ignorado: ${check.reason}`, 'error');
                    return;
                }

                const ext = _ext(file.name);
                const previewTypes = ['png', 'jpg', 'jpeg', 'svg'];
                const objectUrl = previewTypes.includes(ext)
                    ? URL.createObjectURL(file)
                    : null;

                const entry = { id: _uid(), file, objectUrl };
                _diagramStore.push(entry);
                listEl.appendChild(_createItemEl(entry));
                added++;
            });

            _syncEmptyState();
            if (added > 0) toast(`${added} diagrama(s) anexado(s).`);
        }

        /** Preview em modal — usa mostrarModal() do closure externo */
        window._diagramsPreview = function(id) {
            const entry = _diagramStore.find(d => d.id === id);
            if (!entry) return;

            const ext = _ext(entry.file.name);
            let previewHtml = '';

            if (['png', 'jpg', 'jpeg'].includes(ext) && entry.objectUrl) {
                previewHtml = `<img src="${entry.objectUrl}"
                                    alt="${escHtml(entry.file.name)}"
                                    style="max-width:100%;border-radius:var(--radius-sm);">`;
            } else if (ext === 'svg' && entry.objectUrl) {
                previewHtml = `<iframe src="${entry.objectUrl}"
                                       style="width:100%;min-height:320px;border:none;border-radius:var(--radius-sm);"
                                       title="Preview SVG"></iframe>`;
            } else {
                previewHtml = `<p class="empty-msg">Pré-visualização não disponível para este formato.</p>`;
            }

            // mostrarModal() herdado do closure externo (linha ~36)
            mostrarModal(`
                <h3><i class="fas fa-eye" style="color:var(--primary);margin-right:8px;"></i>
                    ${escHtml(entry.file.name)}
                </h3>
                <div class="diagram-preview-wrap" style="margin:16px 0;">
                    ${previewHtml}
                </div>
                <div class="btn-group" style="justify-content:flex-end;">
                    <button class="btn btn-secondary" onclick="fecharModal()">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                    <button class="btn btn-primary"
                            onclick="window._diagramsDownload('${id}');fecharModal()">
                        <i class="fas fa-download"></i> Baixar
                    </button>
                </div>`);
        };

        /** Download do arquivo original */
        window._diagramsDownload = function(id) {
            const entry = _diagramStore.find(d => d.id === id);
            if (!entry) return;
            const url = entry.objectUrl || URL.createObjectURL(entry.file);
            const a   = document.createElement('a');
            a.href    = url;
            a.download = entry.file.name;
            a.click();
            if (!entry.objectUrl) URL.revokeObjectURL(url);
        };

        /** Remove item da lista e libera memória */
        window._diagramsRemove = function(id) {
            const idx = _diagramStore.findIndex(d => d.id === id);
            if (idx === -1) return;

            const entry = _diagramStore[idx];
            if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
            _diagramStore.splice(idx, 1);

            const el = _list()?.querySelector(`[data-did="${id}"]`);
            if (el) el.remove();

            _syncEmptyState();
            toast('Diagrama removido.');
        };

        // ── Event Listeners ───────────────────────────────────────────────
        // Delegados no document para:
        //  a) sobreviver a re-renders do mermaid
        //  b) não conflitar com listeners de #form-projeto (linha 339) ou
        //     #form-requisito (linha 438) que usam seus próprios elementos

        document.addEventListener('change', function(e) {
            if (e.target && e.target.id === 'diagrams-file-input') {
                _processFiles(e.target.files);
                e.target.value = ''; // reset para permitir re-seleção do mesmo arquivo
            }
        });

        document.addEventListener('dragover', function(e) {
            const dz = _dz();
            if (dz && dz.contains(e.target)) {
                e.preventDefault();
                dz.classList.add('drag-over');
            }
        });

        document.addEventListener('dragleave', function(e) {
            const dz = _dz();
            if (dz && !dz.contains(e.relatedTarget)) {
                dz.classList.remove('drag-over');
            }
        });

        document.addEventListener('drop', function(e) {
            const dz = _dz();
            if (dz && dz.contains(e.target)) {
                e.preventDefault();
                dz.classList.remove('drag-over');
                _processFiles(e.dataTransfer.files);
            }
        });

    })(); // /MÓDULO ANEXAR DIAGRAMAS EXTERNOS

    // ═══════════════════════════════════════════════════════════════════════
    // MÓDULO UML — gerenciador simples de diagramas por projeto/tipo
    // ═══════════════════════════════════════════════════════════════════════
    const _uml = {
        projeto: null,
        tipo: 'caso_uso',
        arquivo: null,          // { file, objectUrl }
        store: {},              // chave: "projId|tipo" → Array<entry>
    };

    const _UML_META = {
        caso_uso:  { label: 'Caso de Uso',  badge: '',                uploadLabel: 'Adicionar Diagrama de Caso de Uso', galleryLabel: 'Diagramas de Caso de Uso'  },
        classe:    { label: 'Classe',        badge: 'badge-classe',    uploadLabel: 'Adicionar Diagrama de Classe',       galleryLabel: 'Diagramas de Classe'        },
        sequencia: { label: 'Sequência',     badge: 'badge-sequencia', uploadLabel: 'Adicionar Diagrama de Sequência',   galleryLabel: 'Diagramas de Sequência'    },
    };

    function _umlKey(proj, tipo) { return `${proj}|${tipo}`; }
    function _umlList(proj, tipo) {
        const k = _umlKey(proj, tipo);
        if (!_uml.store[k]) _uml.store[k] = [];
        return _uml.store[k];
    }
    function _umlUID() { return `u${Date.now()}${Math.random().toString(36).slice(2,5)}`; }
    function _umlFmtSize(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
        return (b/1048576).toFixed(2) + ' MB';
    }

    // Atualiza galeria conforme projeto+tipo atual
    function _umlRender() {
        const gallery = document.getElementById('uml-gallery');
        const empty   = document.getElementById('uml-gallery-empty');
        const count   = document.getElementById('uml-count-badge');
        const label   = document.getElementById('uml-gallery-label');
        if (!gallery) return;

        const lista = _umlList(_uml.projeto, _uml.tipo);
        if (label) label.textContent = _UML_META[_uml.tipo].galleryLabel;
        if (count) count.textContent = lista.length;
        gallery.innerHTML = '';

        if (!lista.length) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        lista.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'uml-card';
            card.innerHTML = `
                <div class="uml-card-thumb" onclick="_umlVer('${entry.id}')">
                    <img src="${entry.url}" alt="${escHtml(entry.nome)}" loading="lazy">
                </div>
                <div class="uml-card-body">
                    <div class="uml-card-name" title="${escHtml(entry.nome)}">${escHtml(entry.nome)}</div>
                    <div class="uml-card-actions">
                        <button class="btn btn-sm btn-info"      title="Expandir"  onclick="_umlVer('${entry.id}')"><i class="fas fa-expand"></i></button>
                        <button class="btn btn-sm btn-secondary" title="Baixar"    onclick="_umlBaixar('${entry.id}')"><i class="fas fa-download"></i></button>
                        <button class="btn btn-sm btn-danger"    title="Remover"   onclick="_umlRemover('${entry.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            gallery.appendChild(card);
        });
    }

    // Selecionar projeto (chamado pelo select e por atualizarSelectsProjetos)
    window.umlSetProjeto = function(val) {
        _uml.projeto = val || null;
        const panel  = document.getElementById('uml-panel');
        const estado = document.getElementById('uml-empty-state');
        if (panel)  panel.style.display  = val ? '' : 'none';
        if (estado) estado.style.display = val ? 'none' : '';
        if (val) {
            umlCancelarPreview();
            _umlCarregarDoBanco(val, _uml.tipo); // carrega do banco ao selecionar projeto
            _umlRender();
        }
    };

    // Trocar tipo de diagrama
    window.umlSelecionarTipo = function(tipo) {
        _uml.tipo = tipo;
        if (_uml.projeto) _umlCarregarDoBanco(_uml.projeto, tipo);
        const meta = _UML_META[tipo];
        document.querySelectorAll('.uml-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tipo === tipo));
        const lbl = document.getElementById('uml-upload-label');
        if (lbl) lbl.textContent = meta.uploadLabel;
        const bdg = document.getElementById('uml-type-badge');
        if (bdg) { bdg.textContent = meta.label; bdg.className = 'uml-type-badge ' + meta.badge; }
        umlCancelarPreview();
        _umlRender();
    };

    // Listener do select de projeto
    const _umlSel = document.getElementById('uml-projeto-select');
    if (_umlSel) {
        _umlSel.addEventListener('change', function() { window.umlSetProjeto(this.value); });
    }

    // File input
    const _umlFileInput = document.getElementById('uml-file-input');
    if (_umlFileInput) {
        _umlFileInput.addEventListener('change', function() {
            if (this.files[0]) _umlProcessar(this.files[0]);
            this.value = '';
        });
    }

    // Drag-and-drop
    const _umlDz = document.getElementById('uml-dropzone');
    if (_umlDz) {
        _umlDz.addEventListener('dragover',  e => { e.preventDefault(); _umlDz.classList.add('drag-over'); });
        _umlDz.addEventListener('dragleave', e => { if (!_umlDz.contains(e.relatedTarget)) _umlDz.classList.remove('drag-over'); });
        _umlDz.addEventListener('drop', e => {
            e.preventDefault(); _umlDz.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) _umlProcessar(e.dataTransfer.files[0]);
        });
    }

    // Processar arquivo selecionado → mostrar preview
    function _umlProcessar(file) {
        if (!_uml.projeto) { toast('Selecione um projeto antes de adicionar um diagrama.', 'error'); return; }
        const MIME = new Set(['image/png','image/jpeg','image/svg+xml','image/gif','image/webp']);
        if (!MIME.has(file.type)) { toast('Tipo não permitido. Use PNG, JPG, SVG, GIF ou WebP.', 'error'); return; }
        if (file.size > 10*1024*1024) { toast('Arquivo excede 10 MB.', 'error'); return; }

        if (_uml.arquivo?.url) URL.revokeObjectURL(_uml.arquivo.url);
        _uml.arquivo = { file, url: URL.createObjectURL(file) };

        const dz   = document.getElementById('uml-dropzone');
        const prev = document.getElementById('uml-preview-wrap');
        if (dz)   dz.style.display   = 'none';
        if (prev) prev.style.display = '';

        const img  = document.getElementById('uml-preview-img');
        const fname = document.getElementById('uml-preview-filename');
        const fsize = document.getElementById('uml-preview-size');
        if (img)   img.src             = _uml.arquivo.url;
        if (fname) fname.textContent   = file.name;
        if (fsize) fsize.textContent   = _umlFmtSize(file.size);
    }

    // Cancelar preview
    window.umlCancelarPreview = function() {
        if (_uml.arquivo?.url) URL.revokeObjectURL(_uml.arquivo.url);
        _uml.arquivo = null;
        const dz   = document.getElementById('uml-dropzone');
        const prev = document.getElementById('uml-preview-wrap');
        if (dz)   dz.style.display   = '';
        if (prev) prev.style.display = 'none';
    };

    // Confirmar e salvar na galeria — persiste no banco via API
    window.umlSalvarDiagrama = async function() {
        if (!_uml.arquivo || !_uml.projeto) return;

        const btnSalvar = document.getElementById('uml-btn-salvar');
        if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

        try {
            const fd = new FormData();
            fd.append('diagram',       _uml.arquivo.file);
            fd.append('usuario_id',    currentUser?.id ?? 0);
            fd.append('projeto_id',    _uml.projeto);
            fd.append('tipo_diagrama', _uml.tipo);

            const resp = await fetch(`${API}?action=upload_diagram`, { method: 'POST', body: fd });
            const data = await resp.json();

            if (data.error) {
                toast('Erro ao salvar: ' + data.error, 'error');
                return;
            }

            // Adiciona à galeria com a URL do servidor (persistente)
            const lista = _umlList(_uml.projeto, _uml.tipo);
            lista.push({
                id:       String(data.id ?? _umlUID()),
                dbId:     data.id ?? null,
                nome:     _uml.arquivo.file.name,
                url:      data.url,
                fromDB:   true,
            });

            if (data.warning) toast(data.warning, 'error');
            else toast('Diagrama de ' + _UML_META[_uml.tipo].label + ' salvo!');

        } catch (err) {
            toast('Erro de conexão ao salvar diagrama.', 'error');
            console.error('umlSalvarDiagrama:', err);
        } finally {
            // Revoga a URL temporária e limpa preview
            if (_uml.arquivo?.url) URL.revokeObjectURL(_uml.arquivo.url);
            _uml.arquivo = null;
            const dz   = document.getElementById('uml-dropzone');
            const prev = document.getElementById('uml-preview-wrap');
            if (dz)   dz.style.display   = '';
            if (prev) prev.style.display = 'none';
            if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = '<i class="fas fa-check"></i> Salvar'; }
            _umlRender();
        }
    };

    // Carrega diagramas do banco para o projeto/tipo selecionado
    async function _umlCarregarDoBanco(projetoId, tipo) {
        if (!projetoId || !currentUser?.id) return;
        try {
            const url  = `${API}?tipo=diagrams&usuario_id=${currentUser.id}&projeto_id=${projetoId}&tipo_diagrama=${tipo}`;
            const resp = await fetch(url);
            const rows = await resp.json();
            if (!Array.isArray(rows)) return;

            const lista = _umlList(projetoId, tipo);
            // Evita duplicatas: só adiciona IDs que ainda não existem na lista
            const idsExistentes = new Set(lista.map(e => String(e.dbId)));
            rows.forEach(row => {
                if (!idsExistentes.has(String(row.id))) {
                    lista.push({
                        id:     String(row.id),
                        dbId:   row.id,
                        nome:   row.arquivo_original,
                        url:    row.url,
                        fromDB: true,
                    });
                }
            });
            _umlRender();
        } catch (err) {
            console.warn('_umlCarregarDoBanco:', err);
        }
    }

    // Ver imagem em tela cheia
    window._umlVer = function(id) {
        const entry = Object.values(_uml.store).flat().find(e => e.id === id);
        if (!entry) return;
        mostrarModal(`
            <h3><i class="fas fa-image" style="color:var(--primary);margin-right:8px;"></i>${escHtml(entry.nome)}</h3>
            <div style="margin:16px 0;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);">
                <img src="${entry.url}" alt="${escHtml(entry.nome)}" style="width:100%;max-height:70vh;object-fit:contain;display:block;">
            </div>
            <div class="btn-group" style="justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="fecharModal()"><i class="fas fa-times"></i> Fechar</button>
                <button class="btn btn-primary" onclick="_umlBaixar('${id}');fecharModal()"><i class="fas fa-download"></i> Baixar</button>
            </div>`);
    };

    window._umlBaixar = function(id) {
        const entry = Object.values(_uml.store).flat().find(e => e.id === id);
        if (!entry) return;
        const a = document.createElement('a');
        a.href = entry.url; a.download = entry.nome; a.click();
    };

    window._umlRemover = function(id) {
        const k = _umlKey(_uml.projeto, _uml.tipo);
        const lista = _uml.store[k] || [];
        const idx = lista.findIndex(e => e.id === id);
        if (idx === -1) return;

        const entry = lista[idx];

        // Se veio do banco, deleta via API
        if (entry.fromDB && entry.dbId && currentUser?.id) {
            fetch(`${API}?action=diagrama&id=${entry.dbId}&usuario_id=${currentUser.id}`, { method: 'DELETE' })
                .catch(err => console.warn('Erro ao deletar diagrama do banco:', err));
        }

        // Remove URL temporária se houver
        if (!entry.fromDB && entry.url) URL.revokeObjectURL(entry.url);
        lista.splice(idx, 1);
        toast('Diagrama removido.');
        _umlRender();
    };
    // /MÓDULO UML

    // ─── MÓDULO: CONFIGURAÇÕES DA CONTA ──────────────────────────────────
    (function() {

        // Referências aos elementos do drawer
        const overlay    = document.getElementById('perfil-overlay');
        const drawer     = document.getElementById('perfil-drawer');
        const inputNome  = document.getElementById('perfil-nome');
        const inputEmail = document.getElementById('perfil-email');
        const inputSenha = document.getElementById('perfil-senha');
        const inputConf  = document.getElementById('perfil-senha-confirm');
        const msgError   = document.getElementById('perfil-msg-error');
        const msgSuccess = document.getElementById('perfil-msg-success');
        const saveBtn    = document.getElementById('perfil-salvar-btn');

        /** Preenche o drawer com os dados atuais do currentUser */
        function carregarDadosPerfil() {
            if (!currentUser) return;

            const nome = currentUser.nome || '';
            inputNome.value  = nome;
            inputEmail.value = currentUser.email || '';
            inputSenha.value = '';
            inputConf.value  = '';

            // Atualiza preview do avatar dentro do drawer
            document.getElementById('perfil-avatar-big').textContent    = nome ? nome[0].toUpperCase() : '?';
            document.getElementById('perfil-display-nome').textContent  = nome || '–';
            document.getElementById('perfil-display-role').textContent  = currentUser.papel || 'analista';

            // Limpa mensagens anteriores
            msgError.style.display   = 'none';
            msgSuccess.style.display = 'none';
        }

        /** Abre o drawer de configurações */
        window.abrirPerfilDrawer = function() {
            carregarDadosPerfil();
            overlay.classList.add('open');
            drawer.classList.add('open');
            document.body.style.overflow = 'hidden';
            inputNome.focus();
        };

        /** Fecha o drawer */
        window.fecharPerfilDrawer = function() {
            overlay.classList.remove('open');
            drawer.classList.remove('open');
            document.body.style.overflow = '';
        };

        // Fecha com tecla Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && drawer.classList.contains('open')) {
                window.fecharPerfilDrawer();
            }
        });

        /** Alterna visibilidade da senha */
        window.toggleSenhaVisivel = function() {
            const icon = document.getElementById('toggle-pw-icon');
            const isText = inputSenha.type === 'text';
            inputSenha.type = isText ? 'password' : 'text';
            icon.className  = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
        };

        /** Guarda as alterações chamando a API */
        window.salvarPerfil = async function() {
            if (!currentUser) return;

            const nome  = inputNome.value.trim();
            const email = inputEmail.value.trim();
            const senha = inputSenha.value;
            const conf  = inputConf.value;

            // Validações no cliente
            msgError.style.display   = 'none';
            msgSuccess.style.display = 'none';

            function showError(msg) {
                msgError.textContent   = msg;
                msgError.style.display = 'block';
                msgError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            if (!nome) return showError('O nome de utilizador é obrigatório.');
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return showError('Insira um e-mail válido.');
            }
            if (senha && senha.length < 6) {
                return showError('A nova senha deve ter pelo menos 6 caracteres.');
            }
            if (senha && senha !== conf) {
                return showError('As senhas não coincidem.');
            }

            // Envio para API
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A guardar...';

            try {
                const payload = {
                    tipo:       'update_perfil',
                    usuario_id: currentUser.id,
                    nome,
                    email,
                };
                if (senha) payload.nova_senha = senha;

                const { ok, data } = await apiFetch(`${API}?tipo=update_perfil`, {
                    method: 'POST',
                    body:   JSON.stringify(payload),
                });

                if (data.error) {
                    showError(data.error);
                } else {
                    // Actualiza o estado local e a UI do header
                    currentUser.nome  = nome;
                    currentUser.email = email;
                    salvarSessao(currentUser);

                    document.getElementById('user-name').textContent   = nome;
                    document.getElementById('user-avatar').textContent = nome[0].toUpperCase();
                    document.getElementById('perfil-avatar-big').textContent   = nome[0].toUpperCase();
                    document.getElementById('perfil-display-nome').textContent = nome;

                    msgSuccess.textContent   = 'Perfil atualizado com sucesso!';
                    msgSuccess.style.display = 'block';
                    msgSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                    inputSenha.value = '';
                    inputConf.value  = '';
                    toast('Perfil atualizado!', 'success');
                }
            } catch (err) {
                showError('Erro de ligação. Verifique a sua conexão e tente novamente.');
                console.error('Erro ao guardar perfil:', err);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Alterações';
            }
        };

    })(); // /MÓDULO CONFIGURAÇÕES DA CONTA
});
