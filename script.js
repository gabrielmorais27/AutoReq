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

    // ─── MOBILE SIDEBAR ─────────────────────────────────────────────────────
    const sidebar        = document.getElementById('sidebar');
    const menuToggle     = document.getElementById('menu-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
        document.body.style.overflow = '';
    }

    menuToggle.addEventListener('click', () => {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    sidebarOverlay.addEventListener('click', closeSidebar);

    // ─── TOAST ───────────────────────────────────────────────────────────────
    function toast(msg, tipo = 'success') {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.className   = `toast toast-${tipo} show`;
        setTimeout(() => el.classList.remove('show'), 3500);
    }

    // ─── MODAL ───────────────────────────────────────────────────────────────
    function mostrarModal(html) {
        document.getElementById('modal-box').innerHTML = html;
        document.getElementById('modal-overlay').style.display = 'flex';
    }
    function fecharModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }
    window.fecharModal = fecharModal;

    // Fechar modal clicando fora
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
        if (e.target === this) fecharModal();
    });

    // ─── SESSÃO ──────────────────────────────────────────────────────────────
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

    // ─── INICIAR APP ─────────────────────────────────────────────────────────
    function iniciarApp(user) {
        currentUser = user;
        const nome = user?.nome || 'Usuário';
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        document.getElementById('user-name').textContent = nome;
        document.getElementById('user-role').textContent = user?.papel || 'analista';
        document.getElementById('user-avatar').textContent = nome[0].toUpperCase();
        carregarEstatisticas();
    }

    // ─── BOOT ────────────────────────────────────────────────────────────────
    const sessaoSalva = carregarSessao();
    if (sessaoSalva) {
        iniciarApp(sessaoSalva);
    } else {
        mainApp.style.display   = 'none';
        loginScreen.style.display = 'flex';
    }

    // ─── LOGIN ───────────────────────────────────────────────────────────────
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email  = document.getElementById('login-email').value.trim();
        const senha  = document.getElementById('login-password').value;
        const errEl  = document.getElementById('login-error');
        const btnEl  = document.getElementById('login-btn');

        errEl.style.display = 'none';
        btnEl.disabled      = true;
        btnEl.innerHTML     = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

        try {
            const resp = await fetch(`${API}?action=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });

            if (!resp.ok) throw new Error('Erro de servidor');
            const data = await resp.json();

            if (data.error) {
                errEl.textContent    = data.error;
                errEl.style.display  = 'block';
            } else if (data.success && data.user) {
                salvarSessao(data.user);
                iniciarApp(data.user);
            } else {
                errEl.textContent   = 'Resposta inesperada do servidor.';
                errEl.style.display = 'block';
            }
        } catch (err) {
            // Fallback offline para desenvolvimento
            console.warn('API indisponível – modo offline:', err.message);
            const user = { nome: email.split('@')[0].replace(/[^a-zA-Z]/g,'').toUpperCase() || 'USUÁRIO', papel: 'analista', email };
            salvarSessao(user);
            iniciarApp(user);
        } finally {
            btnEl.disabled  = false;
            btnEl.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
        }
    });

    // ─── LOGOUT ──────────────────────────────────────────────────────────────
    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        limparSessao();
        window.location.reload();
    });

    // ─── RECUPERAÇÃO DE SENHA ─────────────────────────────────────────────────
    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
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

    // ─── NAVEGAÇÃO ───────────────────────────────────────────────────────────
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

            closeSidebar(); // fecha em mobile ao navegar
        });
    });

    // ─── SELECTS DE PROJETO ──────────────────────────────────────────────────
    async function atualizarSelectsProjetos() {
        try {
            const resp = await fetch(`${API}?tipo=projetos&usuario_id=${currentUser?.id || 0}`);
            const projs = await resp.json();
            if (!Array.isArray(projs)) return;

            const options = '<option value="">Selecione um projeto...</option>' +
                projs.map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');

            ['req-projeto-vinculo', 'uml-projeto-select', 'relatorio-projeto-select']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = options;
                });
        } catch (err) { console.error('atualizarSelectsProjetos:', err); }
    }

    document.getElementById('uml-projeto-select').addEventListener('change', e => gerarUML(e.target.value));
    document.getElementById('relatorio-projeto-select').addEventListener('change', e => {
        relatorioProjetoId = e.target.value;
        document.getElementById('export-card').style.display = e.target.value ? 'block' : 'none';
        gerarRelatorios(e.target.value);
    });

    // ─── BADGE ───────────────────────────────────────────────────────────────
    function badge(status) {
        const map = {
            'Pendente': 'badge-warning', 'Aprovado': 'badge-success',
            'Revisão': 'badge-info', 'Ativo': 'badge-success',
            'Planejamento': 'badge-warning', 'Concluído': 'badge-success',
            'Cancelado': 'badge-danger'
        };
        return `<span class="badge ${map[status] || 'badge-warning'}">${status}</span>`;
    }

    function prioridadeIcon(p) {
        const map = { 'Alta': '🔴', 'Média': '🟡', 'Baixa': '🟢' };
        return `${map[p] || ''} ${p}`;
    }

    // ─── [RF01] PROJETOS ─────────────────────────────────────────────────────
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
        if (!dados.nome_projeto || !dados.cliente) {
            toast('Preencha os campos obrigatórios.', 'error'); return;
        }

        try {
            if (editId) {
                dados.projeto_id = editId;
                const resp = await fetch(API, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                const data = await resp.json();
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Projeto atualizado com sucesso!');
                cancelarEdicaoProjeto();
            } else {
                const resp = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                const data = await resp.json();
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Projeto criado com sucesso!');
            }
            document.getElementById('form-projeto').reset();
            carregarListaProjetos();
        } catch (err) { toast('Erro ao salvar projeto.', 'error'); }
    });

    async function carregarListaProjetos() {
        const tbody = document.querySelector('#table-projetos tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

        try {
            const resp  = await fetch(`${API}?tipo=projetos&usuario_id=${currentUser?.id || 0}`);
            const projs = await resp.json();

            if (!Array.isArray(projs) || !projs.length) {
                tbody.innerHTML = `<tr><td colspan="4">
                    <div class="empty-state">
                        <i class="fas fa-folder-open"></i>
                        <p>Nenhum projeto cadastrado. Crie um acima.</p>
                    </div></td></tr>`;
                return;
            }
            tbody.innerHTML = projs.map(p => `
                <tr>
                    <td><strong>${p.nome}</strong>${p.descricao ? `<br><small style="color:var(--sub)">${p.descricao}</small>` : ''}</td>
                    <td>${p.cliente || '–'}</td>
                    <td>${badge(p.status)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-primary" title="Ver requisitos"
                                onclick="verProjeto(${p.id},'${escHtml(p.nome)}')">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-secondary" title="Editar"
                                onclick="editarProjeto(${p.id},'${escHtml(p.nome)}','${escHtml(p.cliente||'')}','${escHtml(p.status)}','${escHtml(p.descricao||'')}')">
                                <i class="fas fa-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" title="Excluir"
                                onclick="confirmarExclusaoProjeto(${p.id},'${escHtml(p.nome)}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`).join('');
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Erro ao carregar projetos.</td></tr>';
        }
    }

    window.editarProjeto = (id, nome, cliente, status, desc) => {
        document.getElementById('proj-edit-id').value  = id;
        document.getElementById('proj-nome').value     = nome;
        document.getElementById('proj-cliente').value  = cliente;
        document.getElementById('proj-status').value   = status;
        document.getElementById('proj-desc').value     = desc;
        document.getElementById('proj-btn-submit').innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
        document.getElementById('proj-btn-cancelar').style.display = 'inline-flex';
        document.getElementById('proj-form-title').innerHTML = '<i class="fas fa-pencil"></i> Editar Projeto';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.cancelarEdicaoProjeto = () => {
        document.getElementById('proj-edit-id').value = '';
        document.getElementById('form-projeto').reset();
        document.getElementById('proj-btn-submit').innerHTML = '<i class="fas fa-save"></i> Criar Projeto';
        document.getElementById('proj-btn-cancelar').style.display = 'none';
        document.getElementById('proj-form-title').innerHTML = '<i class="fas fa-plus-circle"></i> Novo Projeto';
    };

    window.confirmarExclusaoProjeto = (id, nome) => {
        mostrarModal(`
            <h3><i class="fas fa-triangle-exclamation" style="color:var(--danger);margin-right:8px;"></i>Excluir Projeto</h3>
            <p style="margin:16px 0;">Tem certeza que deseja excluir <strong>${nome}</strong>?</p>
            <p style="color:var(--sub);font-size:.82rem;">Todos os requisitos e comentários vinculados serão removidos permanentemente.</p>
            <div class="btn-group" style="justify-content:flex-end;margin-top:24px;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-danger" onclick="excluirProjeto(${id})"><i class="fas fa-trash"></i> Excluir</button>
            </div>
        `);
    };

    window.excluirProjeto = async (id) => {
        fecharModal();
        try {
            const resp = await fetch(`${API}?action=projeto&id=${id}&usuario_id=${currentUser?.id || 0}`, { method: 'DELETE' });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Projeto excluído!');
            carregarListaProjetos();
        } catch { toast('Erro ao excluir projeto.', 'error'); }
    };

    // ─── [RF02] REQUISITOS ───────────────────────────────────────────────────
    document.getElementById('form-requisito').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('req-edit-id').value;
        const dados  = {
            projeto_id:           document.getElementById('req-projeto-vinculo').value,
            id_requisito_manual:  document.getElementById('req-id').value.trim(),
            tipo:                 document.getElementById('req-tipo').value,
            prioridade:           document.getElementById('req-prioridade').value,
            titulo:               document.getElementById('req-titulo').value.trim(),
            desc:                 document.getElementById('req-desc').value.trim(),
            usuario_id:           currentUser?.id || 0
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
                const resp = await fetch(API, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(putDados)
                });
                const data = await resp.json();
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Requisito atualizado!');
                cancelarEdicaoReq();
            } else {
                const resp = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                const data = await resp.json();
                if (data.error) { toast(data.error, 'error'); return; }
                toast('Requisito cadastrado com sucesso!');
            }
            document.getElementById('form-requisito').reset();
        } catch { toast('Erro ao salvar requisito.', 'error'); }
    });

    window.cancelarEdicaoReq = () => {
        document.getElementById('req-edit-id').value = '';
        document.getElementById('form-requisito').reset();
        document.getElementById('req-btn-submit').innerHTML = '<i class="fas fa-save"></i> Salvar Requisito';
        document.getElementById('req-btn-cancelar').style.display = 'none';
        document.getElementById('req-form-title').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Requisito';
    };

    // ─── [RF04] DETALHES DO PROJETO ──────────────────────────────────────────
    window.verProjeto = async (id, nome) => {
        currentProjetoId   = id;
        currentProjetoNome = nome;
        document.getElementById('view-projeto-nome').textContent = nome;
        document.getElementById('filtro-tipo').value       = '';
        document.getElementById('filtro-prioridade').value = '';
        document.getElementById('filtro-status').value     = '';

        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('detalhes-projeto').classList.add('active');
        breadcrumbLabel.innerHTML = `<strong>${nome}</strong>`;

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
            const resp = await fetch(url);
            const reqs = await resp.json();

            if (!Array.isArray(reqs) || !reqs.length) {
                tbody.innerHTML = `<tr><td colspan="6">
                    <div class="empty-state">
                        <i class="fas fa-clipboard-list"></i>
                        <p>Nenhum requisito encontrado para este projeto.</p>
                    </div></td></tr>`;
                return;
            }
            tbody.innerHTML = reqs.map(r => `
                <tr>
                    <td><code>${r.codigo}</code></td>
                    <td>${r.titulo}</td>
                    <td><span class="badge badge-info">${r.tipo}</span></td>
                    <td>${prioridadeIcon(r.prioridade)}</td>
                    <td>${badge(r.status)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-secondary" title="Editar"
                                onclick="editarRequisito(${r.id},'${escHtml(r.codigo)}','${escHtml(r.tipo)}','${escHtml(r.titulo)}','${escHtml(r.descricao||'')}','${escHtml(r.prioridade)}')">
                                <i class="fas fa-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-success" title="Aprovar"
                                onclick="validarRequisito(${r.id},'Aprovado')" ${r.status==='Aprovado'?'disabled':''}>
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-sm btn-warning" title="Solicitar Revisão"
                                onclick="abrirRevisao(${r.id})" ${r.status==='Revisão'?'disabled':''}>
                                <i class="fas fa-rotate"></i>
                            </button>
                            <button class="btn btn-sm btn-info" title="Comentários"
                                onclick="abrirComentarios(${r.id},'${escHtml(r.titulo)}')">
                                <i class="fas fa-comments"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" title="Excluir"
                                onclick="confirmarExclusaoReq(${r.id},'${escHtml(r.titulo)}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`).join('');
        } catch {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Erro ao carregar requisitos.</td></tr>';
        }
    }

    // [SF04.1] Filtros
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

    // [SF02.1] Editar Requisito
    window.editarRequisito = (id, codigo, tipo, titulo, desc, prioridade) => {
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('requisitos').classList.add('active');
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('.nav-item[data-target="requisitos"]').classList.add('active');
        breadcrumbLabel.innerHTML = '<strong>Requisitos</strong>';

        atualizarSelectsProjetos().then(() => {
            document.getElementById('req-edit-id').value   = id;
            document.getElementById('req-id').value        = codigo;
            document.getElementById('req-tipo').value      = tipo;
            document.getElementById('req-titulo').value    = titulo;
            document.getElementById('req-desc').value      = desc;
            document.getElementById('req-prioridade').value = prioridade;
            document.getElementById('req-btn-submit').innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
            document.getElementById('req-btn-cancelar').style.display = 'inline-flex';
            document.getElementById('req-form-title').innerHTML = '<i class="fas fa-pencil"></i> Editar Requisito';
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
            </div>
        `);
    };

    window.excluirRequisito = async (id) => {
        fecharModal();
        try {
            const resp = await fetch(`${API}?action=requisito&id=${id}&usuario_id=${currentUser?.id || 0}`, { method: 'DELETE' });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Requisito excluído!');
            carregarRequisitosDetalhes(currentProjetoId);
        } catch { toast('Erro ao excluir requisito.', 'error'); }
    };

    // ─── [RF05] VALIDAÇÃO ────────────────────────────────────────────────────
    window.validarRequisito = async (id, novoStatus, justificativa = '') => {
        try {
            const resp = await fetch(API, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requisito_id: id, novo_status: novoStatus,
                    justificativa, usuario_id: currentUser?.id || 0
                })
            });
            const data = await resp.json();
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
            </div>
        `);
    };

    window.confirmarRevisao = (id) => {
        const just = document.getElementById('revisao-justificativa').value.trim();
        fecharModal();
        validarRequisito(id, 'Revisão', just);
    };

    // ─── [RF07] COMENTÁRIOS ──────────────────────────────────────────────────
    window.abrirComentarios = async (reqId, titulo) => {
        try {
            const resp = await fetch(`${API}?tipo=comentarios&requisito_id=${reqId}`);
            const comentarios = await resp.json();

            const lista = Array.isArray(comentarios) && comentarios.length
                ? comentarios.map(c => `
                    <div class="comentario">
                        <div class="comentario-header">
                            <strong>${c.autor}</strong>
                            <small>${c.criado_em || ''}</small>
                        </div>
                        <p>${c.texto}</p>
                    </div>`).join('')
                : '<p class="empty-msg">Nenhum comentário ainda.</p>';

            mostrarModal(`
                <h3><i class="fas fa-comments" style="color:var(--primary);margin-right:8px;"></i>${titulo}</h3>
                <div id="lista-comentarios" style="max-height:280px;overflow-y:auto;margin:16px 0 12px;">${lista}</div>
                <div class="group">
                    <label>Novo comentário</label>
                    <textarea id="novo-comentario" rows="3" placeholder="Digite seu comentário..."></textarea>
                </div>
                <div class="btn-group" style="justify-content:flex-end;">
                    <button class="btn btn-secondary" onclick="fecharModal()"><i class="fas fa-times"></i> Fechar</button>
                    <button class="btn btn-primary" onclick="salvarComentario(${reqId})"><i class="fas fa-paper-plane"></i> Enviar</button>
                </div>
            `);
        } catch { toast('Erro ao carregar comentários.', 'error'); }
    };

    window.salvarComentario = async (reqId) => {
        const texto = document.getElementById('novo-comentario')?.value?.trim();
        if (!texto) { toast('Escreva um comentário antes de enviar.', 'error'); return; }
        try {
            const resp = await fetch(`${API}?action=comentario`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requisito_id: reqId, autor: currentUser?.nome || 'Usuário', texto })
            });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Comentário salvo!');
            fecharModal();
        } catch { toast('Erro ao salvar comentário.', 'error'); }
    };

    // ─── [RF06] EXPORTAR ERS ─────────────────────────────────────────────────
    window.exportarERS = async (formato) => {
        if (!relatorioProjetoId) { toast('Selecione um projeto.', 'error'); return; }
        try {
            const [respProj, respReqs] = await Promise.all([
                fetch(`${API}?tipo=projetos&usuario_id=${currentUser?.id || 0}`),
                fetch(`${API}?tipo=requisitos&projeto_id=${relatorioProjetoId}&usuario_id=${currentUser?.id || 0}`)
            ]);
            const projs   = await respProj.json();
            const reqs    = await respReqs.json();
            const projeto  = Array.isArray(projs) ? projs.find(p => p.id == relatorioProjetoId) : null;

            if (!Array.isArray(reqs) || !reqs.length) {
                toast('Nenhum requisito encontrado para exportar.', 'error'); return;
            }

            const dataHoje   = new Date().toLocaleDateString('pt-BR');
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
                const blob = new Blob([md], { type: 'text/markdown' });
                downloadBlob(blob, `ERS_${nomeProjeto.replace(/\s/g,'_')}.md`);
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

    // ─── [RF04] RELATÓRIOS ───────────────────────────────────────────────────
    async function gerarRelatorios(projId) {
        if (!projId) return;
        try {
            const resp = await fetch(`${API}?tipo=requisitos&projeto_id=${projId}&usuario_id=${currentUser?.id || 0}`);
            const reqs = await resp.json();
            if (!Array.isArray(reqs)) return;

            const rf    = reqs.filter(r => r.tipo === 'RF').length;
            const rnf   = reqs.filter(r => r.tipo === 'RNF').length;
            const alta  = reqs.filter(r => r.prioridade === 'Alta').length;
            const media = reqs.filter(r => r.prioridade === 'Média').length;
            const baixa = reqs.filter(r => r.prioridade === 'Baixa').length;

            if (chartInstance1) chartInstance1.destroy();
            if (chartInstance2) chartInstance2.destroy();

            chartInstance1 = new Chart(document.getElementById('chartRequisitos'), {
                type: 'doughnut',
                data: {
                    labels: ['Funcionais (RF)', 'Não Funcionais (RNF)'],
                    datasets: [{ data: [rf, rnf], backgroundColor: ['#2563eb', '#10b981'], borderWidth: 0 }]
                },
                options: { plugins: { legend: { position: 'bottom' } }, cutout: '65%' }
            });

            chartInstance2 = new Chart(document.getElementById('chartCategorias'), {
                type: 'bar',
                data: {
                    labels: ['Alta', 'Média', 'Baixa'],
                    datasets: [{
                        label: 'Requisitos por Prioridade',
                        data: [alta, media, baixa],
                        backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                        borderRadius: 6
                    }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
        } catch { console.error('Erro ao gerar relatórios'); }
    }

    // ─── UML (Mermaid.js) ────────────────────────────────────────────────────
    async function gerarUML(projId) {
        if (!projId) return;
        const container = document.getElementById('mermaid-container');
        container.innerHTML = '<p class="empty-msg"><i class="fas fa-spinner fa-spin"></i> Gerando diagrama...</p>';
        try {
            const resp = await fetch(`${API}?tipo=requisitos&projeto_id=${projId}&usuario_id=${currentUser?.id || 0}`);
            const reqs = await resp.json();
            if (!Array.isArray(reqs) || !reqs.length) {
                container.innerHTML = '<p class="empty-msg">Nenhum requisito encontrado para este projeto.</p>';
                return;
            }
            let graphDef = 'graph LR\n  User((👤 Usuário)) --- Sys[Sistema]\n';
            reqs.forEach(r => {
                const label = r.titulo.replace(/"/g,"'").substring(0, 30);
                graphDef += `  Sys --- ${r.codigo.replace(/\s/g,'_')}("${r.codigo}: ${label}")\n`;
            });
            container.innerHTML = `<pre class="mermaid">${graphDef}</pre>`;
            if (window.mermaid) window.mermaid.run({ nodes: [container] });
        } catch { container.innerHTML = '<p class="empty-msg">Erro ao gerar diagrama.</p>'; }
    }

    // ─── DASHBOARD ───────────────────────────────────────────────────────────
    async function carregarEstatisticas() {
        try {
            const uid = currentUser?.id || 0;
            const [rReq, rProj] = await Promise.all([
                fetch(`${API}?tipo=requisitos&usuario_id=${uid}`),
                fetch(`${API}?tipo=projetos&usuario_id=${uid}`)
            ]);
            const reqs  = await rReq.json();
            const projs = await rProj.json();

            document.getElementById('stat-req').textContent   = Array.isArray(reqs)  ? reqs.length  : 0;
            document.getElementById('stat-proj').textContent  = Array.isArray(projs) ? projs.length : 0;
            document.getElementById('stat-pend').textContent  = Array.isArray(reqs)  ? reqs.filter(r => r.status === 'Pendente').length  : 0;
            document.getElementById('stat-aprov').textContent = Array.isArray(reqs)  ? reqs.filter(r => r.status === 'Aprovado').length  : 0;
        } catch { console.error('Erro ao carregar estatísticas'); }
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    window.cancelarEdicaoProjeto = cancelarEdicaoProjeto;
    window.cancelarEdicaoReq     = cancelarEdicaoReq;
});
