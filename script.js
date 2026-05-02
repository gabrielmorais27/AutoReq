document.addEventListener('DOMContentLoaded', () => {

    // ─── Estado Global ───────────────────────────────────────────────────────
    let currentUser = null;
    let currentProjetoId = null;
    let currentProjetoNome = '';
    let chartInstance1 = null;
    let chartInstance2 = null;
    let relatorioProjetoId = null;

    const API = 'api.php';
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const navLinks = document.querySelectorAll('.nav-item[data-target]');
    const tabs = document.querySelectorAll('.tab-content');

    // ─── Utilitários ─────────────────────────────────────────────────────────
    function toast(msg, tipo = 'success') {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.className = `toast toast-${tipo} show`;
        setTimeout(() => el.classList.remove('show'), 3500);
    }

    function mostrarModal(html) {
        document.getElementById('modal-box').innerHTML = html;
        document.getElementById('modal-overlay').style.display = 'flex';
    }

    function fecharModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-overlay')) fecharModal();
    });

    function badge(status) {
        const map = { 'Pendente': 'badge-warning', 'Aprovado': 'badge-success', 'Revisão': 'badge-info', 'Ativo': 'badge-success', 'Planejamento': 'badge-warning', 'Concluído': 'badge-success', 'Cancelado': 'badge-danger' };
        return `<span class="badge ${map[status] || 'badge-warning'}">${status}</span>`;
    }

    function prioridadeIcon(p) {
        const map = { 'Alta': '🔴', 'Média': '🟡', 'Baixa': '🟢' };
        return `${map[p] || ''} ${p}`;
    }

    // ─── SESSÃO ───────────────────────────────────────────────────────────────
    const SESSION_KEY = 'autoreq_session';

    function salvarSessao(user) {
        const sessao = {
            user,
            timestamp: Date.now()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
    }

    function carregarSessao() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const sessao = JSON.parse(raw);
            // Expirar sessão após 8 horas
            const oitoHoras = 8 * 60 * 60 * 1000;
            if (Date.now() - sessao.timestamp > oitoHoras) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return sessao.user;
        } catch {
            return null;
        }
    }

    function limparSessao() {
        localStorage.removeItem(SESSION_KEY);
    }

    function iniciarApp(user) {
        currentUser = user;
        const nome = currentUser?.nome || 'Usuário';
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        document.getElementById('user-name').textContent = nome;
        document.getElementById('user-avatar').textContent = nome[0].toUpperCase();
        carregarEstatisticas();
    }

    // ─── Restaurar sessão ao carregar a página ────────────────────────────────
    const sessaoSalva = carregarSessao();
    if (sessaoSalva) {
        iniciarApp(sessaoSalva);
    }

    // ─── [RF03] LOGIN ─────────────────────────────────────────────────────────
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');
        errEl.style.display = 'none';

        try {
            const resp = await fetch(`${API}?action=login`, {
                method: 'POST',
                body: JSON.stringify({ email, senha })
            });
            const data = await resp.json();
            if (data.error) {
                errEl.textContent = data.error;
                errEl.style.display = 'block';
                return;
            }
            salvarSessao(data.user);
            iniciarApp(data.user);
        } catch {
            // Fallback: login local se backend não tiver tabela usuarios ainda
            const nome = email.split('@')[0].toUpperCase();
            const user = { nome, papel: 'analista', email };
            salvarSessao(user);
            iniciarApp(user);
        }
    });

    // [SF03.1] – Esqueci minha senha
    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
        e.preventDefault();
        mostrarModal(`
            <h3 style="margin-bottom:15px;">Recuperar Senha</h3>
            <p style="color:var(--sub);margin-bottom:15px;">Insira seu e-mail para receber o link de redefinição.</p>
            <div class="group">
                <label>E-mail institucional</label>
                <input type="email" id="forgot-email" placeholder="dev@empresa.com">
            </div>
            <div class="btn-group" style="justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="enviarRecuperacao()">Enviar link</button>
            </div>
        `);
    });

    window.enviarRecuperacao = () => {
        const email = document.getElementById('forgot-email').value;
        if (!email) { toast('Informe um e-mail.', 'error'); return; }
        fecharModal();
        toast(`Link de recuperação enviado para ${email}`);
    };

    // ─── NAVEGAÇÃO ───────────────────────────────────────────────────────────
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            tabs.forEach(t => t.classList.remove('active'));
            document.getElementById(target).classList.add('active');

            if (target === 'projetos') carregarListaProjetos();
            if (target === 'requisitos') atualizarSelectsProjetos();
            if (target === 'relatorios') atualizarSelectsProjetos();
            if (target === 'uml') atualizarSelectsProjetos();
            if (target === 'dashboard') carregarEstatisticas();
        });
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        limparSessao();
        window.location.reload();
    });

    // ─── SELECTS DE PROJETO ──────────────────────────────────────────────────
    async function atualizarSelectsProjetos() {
        const resp = await fetch(`${API}?tipo=projetos`);
        const projs = await resp.json();
        const options = '<option value="">Selecione um projeto...</option>' +
            projs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        document.getElementById('req-projeto-vinculo').innerHTML = options;
        document.getElementById('uml-projeto-select').innerHTML = options;
        document.getElementById('relatorio-projeto-select').innerHTML = options;
    }

    document.getElementById('uml-projeto-select').addEventListener('change', (e) => gerarUML(e.target.value));
    document.getElementById('relatorio-projeto-select').addEventListener('change', (e) => {
        relatorioProjetoId = e.target.value;
        document.getElementById('export-card').style.display = e.target.value ? 'block' : 'none';
        gerarRelatorios(e.target.value);
    });

    // ─── [RF01] PROJETOS ─────────────────────────────────────────────────────
    document.getElementById('form-projeto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('proj-edit-id').value;
        const dados = {
            nome_projeto: document.getElementById('proj-nome').value,
            cliente: document.getElementById('proj-cliente').value,
            status: document.getElementById('proj-status').value,
            desc: document.getElementById('proj-desc').value
        };
        if (!dados.nome_projeto || !dados.cliente) { toast('Preencha os campos obrigatórios.', 'error'); return; }

        if (editId) {
            dados.projeto_id = editId;
            const resp = await fetch(API, { method: 'PUT', body: JSON.stringify(dados) });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Projeto atualizado com sucesso!');
            cancelarEdicaoProjeto();
        } else {
            const resp = await fetch(API, { method: 'POST', body: JSON.stringify(dados) });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Projeto criado com sucesso!');
        }
        document.getElementById('form-projeto').reset();
        carregarListaProjetos();
    });

    async function carregarListaProjetos() {
        const resp = await fetch(`${API}?tipo=projetos`);
        const projs = await resp.json();
        const tbody = document.querySelector('#table-projetos tbody');
        if (!projs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Nenhum projeto disponível. Crie um acima.</td></tr>';
            return;
        }
        tbody.innerHTML = projs.map(p => `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.cliente || '-'}</td>
                <td>${badge(p.status)}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="verProjeto(${p.id},'${escHtml(p.nome)}')"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-secondary" onclick="editarProjeto(${p.id},'${escHtml(p.nome)}','${escHtml(p.cliente||'')}','${escHtml(p.status)}','${escHtml(p.descricao||'')}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="confirmarExclusaoProjeto(${p.id},'${escHtml(p.nome)}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    }

    window.editarProjeto = (id, nome, cliente, status, desc) => {
        document.getElementById('proj-edit-id').value = id;
        document.getElementById('proj-nome').value = nome;
        document.getElementById('proj-cliente').value = cliente;
        document.getElementById('proj-status').value = status;
        document.getElementById('proj-desc').value = desc;
        document.getElementById('proj-btn-submit').textContent = 'Salvar Alterações';
        document.getElementById('proj-btn-cancelar').style.display = 'inline-block';
        document.querySelector('#projetos .card h3').textContent = '✏️ Editar Projeto';
        window.scrollTo(0, 0);
    };

    window.cancelarEdicaoProjeto = () => {
        document.getElementById('proj-edit-id').value = '';
        document.getElementById('form-projeto').reset();
        document.getElementById('proj-btn-submit').textContent = 'Criar Projeto';
        document.getElementById('proj-btn-cancelar').style.display = 'none';
        document.querySelector('#projetos .card h3').textContent = '+ Novo Projeto';
    };

    window.confirmarExclusaoProjeto = (id, nome) => {
        mostrarModal(`
            <h3 style="margin-bottom:10px;">Excluir Projeto</h3>
            <p>Tem certeza que deseja excluir <strong>${nome}</strong>?<br>
            <small style="color:var(--sub);">Todos os requisitos e comentários vinculados serão removidos.</small></p>
            <div class="btn-group" style="justify-content:flex-end;margin-top:20px;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-danger" onclick="excluirProjeto(${id})">Sim, excluir</button>
            </div>
        `);
    };

    window.excluirProjeto = async (id) => {
        fecharModal();
        const resp = await fetch(`${API}?action=projeto&id=${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.error) { toast(data.error, 'error'); return; }
        toast('Projeto excluído!');
        carregarListaProjetos();
    };

    // ─── [RF02] REQUISITOS ───────────────────────────────────────────────────
    document.getElementById('form-requisito').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('req-edit-id').value;
        const dados = {
            projeto_id: document.getElementById('req-projeto-vinculo').value,
            id_requisito_manual: document.getElementById('req-id').value,
            tipo: document.getElementById('req-tipo').value,
            prioridade: document.getElementById('req-prioridade').value,
            titulo: document.getElementById('req-titulo').value,
            desc: document.getElementById('req-desc').value
        };

        if (!dados.projeto_id) { toast('Selecione um projeto.', 'error'); return; }
        if (!dados.id_requisito_manual || !dados.titulo) { toast('Preencha os campos obrigatórios.', 'error'); return; }

        if (editId) {
            const putDados = { req_id: editId, codigo: dados.id_requisito_manual, tipo: dados.tipo, titulo: dados.titulo, desc: dados.desc, prioridade: dados.prioridade };
            const resp = await fetch(API, { method: 'PUT', body: JSON.stringify(putDados) });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Requisito atualizado!');
            cancelarEdicaoReq();
        } else {
            const resp = await fetch(API, { method: 'POST', body: JSON.stringify(dados) });
            const data = await resp.json();
            if (data.error) { toast(data.error, 'error'); return; }
            toast('Requisito cadastrado com sucesso!');
        }
        document.getElementById('form-requisito').reset();
    });

    window.cancelarEdicaoReq = () => {
        document.getElementById('req-edit-id').value = '';
        document.getElementById('form-requisito').reset();
        document.getElementById('req-btn-submit').textContent = 'Salvar Requisito';
        document.getElementById('req-btn-cancelar').style.display = 'none';
    };

    // ─── [RF04] DETALHES / LISTAGEM ──────────────────────────────────────────
    window.verProjeto = async (id, nome) => {
        currentProjetoId = id;
        currentProjetoNome = nome;
        document.getElementById('view-projeto-nome').textContent = nome;
        document.getElementById('filtro-tipo').value = '';
        document.getElementById('filtro-prioridade').value = '';
        document.getElementById('filtro-status').value = '';
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('detalhes-projeto').classList.add('active');
        await carregarRequisitosDetalhes(id);
    };

    async function carregarRequisitosDetalhes(projId, filtros = {}) {
        let url = `${API}?tipo=requisitos&projeto_id=${projId}`;
        if (filtros.tipo) url += `&filtro_tipo=${filtros.tipo}`;
        if (filtros.status) url += `&filtro_status=${filtros.status}`;
        if (filtros.prioridade) url += `&filtro_prioridade=${filtros.prioridade}`;
        const resp = await fetch(url);
        const reqs = await resp.json();
        const tbody = document.querySelector('#table-requisitos-projeto tbody');
        if (!reqs.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Nenhum requisito encontrado.</td></tr>';
            return;
        }
        tbody.innerHTML = reqs.map(r => `
            <tr>
                <td><code>${r.codigo}</code></td>
                <td>${r.titulo}</td>
                <td>${r.tipo}</td>
                <td>${prioridadeIcon(r.prioridade)}</td>
                <td>${badge(r.status)}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" title="Editar" onclick="editarRequisito(${r.id},'${escHtml(r.codigo)}','${escHtml(r.tipo)}','${escHtml(r.titulo)}','${escHtml(r.descricao||'')}','${escHtml(r.prioridade)}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-success" title="Aprovar" onclick="validarRequisito(${r.id},'Aprovado')" ${r.status==='Aprovado'?'disabled':''}><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-warning" title="Solicitar Revisão" onclick="abrirRevisao(${r.id})" ${r.status==='Revisão'?'disabled':''}><i class="fas fa-redo"></i></button>
                        <button class="btn btn-sm btn-info" title="Comentários" onclick="abrirComentarios(${r.id},'${escHtml(r.titulo)}')"><i class="fas fa-comments"></i></button>
                        <button class="btn btn-sm btn-danger" title="Excluir" onclick="confirmarExclusaoReq(${r.id},'${escHtml(r.titulo)}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    }

    // [SF04.1] Filtros
    window.aplicarFiltros = () => {
        if (!currentProjetoId) return;
        carregarRequisitosDetalhes(currentProjetoId, {
            tipo: document.getElementById('filtro-tipo').value,
            status: document.getElementById('filtro-status').value,
            prioridade: document.getElementById('filtro-prioridade').value
        });
    };

    window.voltarProjetos = () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('projetos').classList.add('active');
        carregarListaProjetos();
    };

    // [SF02.1] Editar Requisito
    window.editarRequisito = (id, codigo, tipo, titulo, desc, prioridade) => {
        // Navegar para aba de requisitos
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('requisitos').classList.add('active');
        atualizarSelectsProjetos().then(() => {
            document.getElementById('req-edit-id').value = id;
            document.getElementById('req-id').value = codigo;
            document.getElementById('req-tipo').value = tipo;
            document.getElementById('req-titulo').value = titulo;
            document.getElementById('req-desc').value = desc;
            document.getElementById('req-prioridade').value = prioridade;
            document.getElementById('req-btn-submit').textContent = 'Salvar Alterações';
            document.getElementById('req-btn-cancelar').style.display = 'inline-block';
        });
    };

    window.confirmarExclusaoReq = (id, titulo) => {
        mostrarModal(`
            <h3 style="margin-bottom:10px;">Excluir Requisito</h3>
            <p>Deseja excluir o requisito <strong>${titulo}</strong>?</p>
            <div class="btn-group" style="justify-content:flex-end;margin-top:20px;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-danger" onclick="excluirRequisito(${id})">Sim, excluir</button>
            </div>
        `);
    };

    window.excluirRequisito = async (id) => {
        fecharModal();
        const resp = await fetch(`${API}?action=requisito&id=${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.error) { toast(data.error, 'error'); return; }
        toast('Requisito excluído!');
        carregarRequisitosDetalhes(currentProjetoId);
    };

    // ─── [RF05] VALIDAÇÃO ────────────────────────────────────────────────────
    window.validarRequisito = async (id, novoStatus, justificativa = '') => {
        const resp = await fetch(API, {
            method: 'PUT',
            body: JSON.stringify({ requisito_id: id, novo_status: novoStatus, justificativa })
        });
        const data = await resp.json();
        if (data.error) { toast(data.error, 'error'); return; }
        toast(`Requisito marcado como: ${novoStatus}`);
        carregarRequisitosDetalhes(currentProjetoId);
    };

    // [SF05.1] Solicitar revisão com comentário
    window.abrirRevisao = (id) => {
        mostrarModal(`
            <h3 style="margin-bottom:10px;">Solicitar Revisão</h3>
            <p style="color:var(--sub);margin-bottom:10px;">Adicione uma justificativa para a revisão:</p>
            <div class="group">
                <textarea id="revisao-justificativa" rows="4" placeholder="Descreva o motivo da revisão..."></textarea>
            </div>
            <div class="btn-group" style="justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                <button class="btn btn-warning" onclick="confirmarRevisao(${id})">Solicitar Revisão</button>
            </div>
        `);
    };

    window.confirmarRevisao = (id) => {
        const just = document.getElementById('revisao-justificativa').value;
        fecharModal();
        validarRequisito(id, 'Revisão', just);
    };

    // ─── [RF07] COMENTÁRIOS ──────────────────────────────────────────────────
    window.abrirComentarios = async (reqId, titulo) => {
        const resp = await fetch(`${API}?tipo=comentarios&requisito_id=${reqId}`);
        const comentarios = await resp.json();
        const lista = comentarios.length
            ? comentarios.map(c => `
                <div class="comentario">
                    <div class="comentario-header"><strong>${c.autor}</strong><small>${c.criado_em || ''}</small></div>
                    <p>${c.texto}</p>
                </div>`).join('')
            : '<p class="empty-msg">Nenhum comentário ainda.</p>';

        mostrarModal(`
            <h3 style="margin-bottom:10px;"><i class="fas fa-comments"></i> ${titulo}</h3>
            <div id="lista-comentarios" style="max-height:300px;overflow-y:auto;margin-bottom:15px;">${lista}</div>
            <div class="group">
                <label>Novo comentário</label>
                <textarea id="novo-comentario" rows="3" placeholder="Digite seu comentário..."></textarea>
            </div>
            <div class="btn-group" style="justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>
                <button class="btn btn-primary" onclick="salvarComentario(${reqId})">Enviar</button>
            </div>
        `);
    };

    window.salvarComentario = async (reqId) => {
        const texto = document.getElementById('novo-comentario').value.trim();
        if (!texto) { toast('Escreva um comentário antes de enviar.', 'error'); return; }
        const resp = await fetch(`${API}?action=comentario`, {
            method: 'POST',
            body: JSON.stringify({ requisito_id: reqId, autor: currentUser?.nome || 'Usuário', texto })
        });
        const data = await resp.json();
        if (data.error) { toast(data.error, 'error'); return; }
        toast('Comentário salvo!');
        fecharModal();
        abrirComentarios(reqId, '');
    };

    // ─── [RF06] EXPORTAR ERS ─────────────────────────────────────────────────
    window.exportarERS = async (formato) => {
        if (!relatorioProjetoId) { toast('Selecione um projeto.', 'error'); return; }
        const respProj = await fetch(`${API}?tipo=projetos`);
        const projs = await respProj.json();
        const projeto = projs.find(p => p.id == relatorioProjetoId);

        const respReqs = await fetch(`${API}?tipo=requisitos&projeto_id=${relatorioProjetoId}`);
        const reqs = await respReqs.json();

        if (!reqs.length) { toast('Nenhum requisito encontrado para exportar.', 'error'); return; }

        const dataHoje = new Date().toLocaleDateString('pt-BR');
        const nomeProjeto = projeto?.nome || 'Projeto';

        if (formato === 'md') {
            let md = `# Documento de Requisitos de Software (ERS)\n\n`;
            md += `**Projeto:** ${nomeProjeto}\n`;
            md += `**Cliente:** ${projeto?.cliente || '-'}\n`;
            md += `**Data:** ${dataHoje}\n`;
            md += `**Status:** ${projeto?.status || '-'}\n\n---\n\n`;
            md += `## Requisitos\n\n`;
            reqs.forEach(r => {
                md += `### [${r.codigo}] ${r.titulo}\n`;
                md += `- **Tipo:** ${r.tipo}\n- **Prioridade:** ${r.prioridade}\n- **Status:** ${r.status}\n`;
                md += `- **Descrição:** ${r.descricao || '_Sem descrição._'}\n\n`;
            });
            const blob = new Blob([md], { type: 'text/markdown' });
            downloadBlob(blob, `ERS_${nomeProjeto.replace(/\s/g,'_')}.md`);
            toast('Markdown gerado e baixado!');
        } else {
            // PDF simples via janela de impressão
            const rfList = reqs.filter(r => r.tipo === 'RF');
            const rnfList = reqs.filter(r => r.tipo === 'RNF');
            const gerarSecao = (lista, tipo) => lista.map(r => `
                <div style="margin-bottom:15px;padding:12px;border:1px solid #ddd;border-radius:6px;">
                    <strong>[${r.codigo}] ${r.titulo}</strong>
                    <table style="width:100%;margin-top:8px;font-size:0.85rem;">
                        <tr><td><b>Prioridade:</b> ${r.prioridade}</td><td><b>Status:</b> ${r.status}</td></tr>
                    </table>
                    <p style="margin-top:8px;">${r.descricao || '<em>Sem descrição.</em>'}</p>
                </div>`).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
                <title>ERS – ${nomeProjeto}</title>
                <style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{color:#1e5ba0}table{border-collapse:collapse;width:100%}td{padding:4px 8px}</style>
                </head><body>
                <h1>Documento ERS</h1>
                <p><b>Projeto:</b> ${nomeProjeto} &nbsp;|&nbsp; <b>Cliente:</b> ${projeto?.cliente || '-'} &nbsp;|&nbsp; <b>Data:</b> ${dataHoje}</p>
                <hr>
                <h2>Requisitos Funcionais (RF)</h2>${gerarSecao(rfList,'RF') || '<p>Nenhum.</p>'}
                <h2>Requisitos Não Funcionais (RNF)</h2>${gerarSecao(rnfList,'RNF') || '<p>Nenhum.</p>'}
                <script>window.onload=()=>{window.print();}<\/script></body></html>`;
            const win = window.open('', '_blank');
            win.document.write(html);
            win.document.close();
            toast('PDF aberto na janela de impressão!');
        }
    };

    function downloadBlob(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    }

    // ─── [RF04] Relatórios ───────────────────────────────────────────────────
    async function gerarRelatorios(projId) {
        if (!projId) return;
        const resp = await fetch(`${API}?tipo=requisitos&projeto_id=${projId}`);
        const reqs = await resp.json();

        const rf = reqs.filter(r => r.tipo === 'RF').length;
        const rnf = reqs.filter(r => r.tipo === 'RNF').length;
        const alta = reqs.filter(r => r.prioridade === 'Alta').length;
        const media = reqs.filter(r => r.prioridade === 'Média').length;
        const baixa = reqs.filter(r => r.prioridade === 'Baixa').length;

        if (chartInstance1) chartInstance1.destroy();
        if (chartInstance2) chartInstance2.destroy();

        chartInstance1 = new Chart(document.getElementById('chartRequisitos'), {
            type: 'doughnut',
            data: {
                labels: ['Funcionais (RF)', 'Não Funcionais (RNF)'],
                datasets: [{ data: [rf, rnf], backgroundColor: ['#1e5ba0', '#10b981'] }]
            }
        });

        chartInstance2 = new Chart(document.getElementById('chartCategorias'), {
            type: 'bar',
            data: {
                labels: ['Alta', 'Média', 'Baixa'],
                datasets: [{ label: 'Requisitos por Prioridade', data: [alta, media, baixa], backgroundColor: ['#ef4444', '#f59e0b', '#10b981'] }]
            }
        });
    }

    // ─── UML (Mermaid.js) ────────────────────────────────────────────────────
    async function gerarUML(projId) {
        if (!projId) return;
        const resp = await fetch(`${API}?tipo=requisitos&projeto_id=${projId}`);
        const reqs = await resp.json();

        let graphDef = 'graph LR\n  User((👤 Usuário)) --- Sys[Sistema]\n';
        reqs.forEach(r => {
            const label = r.titulo.replace(/"/g, "'").substring(0, 30);
            graphDef += `  Sys --- ${r.codigo.replace(/\s/g,'_')}("${r.codigo}: ${label}")\n`;
        });

        const container = document.getElementById('mermaid-container');
        container.innerHTML = `<pre class="mermaid">${graphDef}</pre>`;
        if (window.mermaid) window.mermaid.run({ nodes: [container] });
    }

    // ─── DASHBOARD ───────────────────────────────────────────────────────────
    async function carregarEstatisticas() {
        const [rReq, rProj] = await Promise.all([
            fetch(`${API}?tipo=requisitos`),
            fetch(`${API}?tipo=projetos`)
        ]);
        const reqs = await rReq.json();
        const projs = await rProj.json();
        document.getElementById('stat-req').textContent = Array.isArray(reqs) ? reqs.length : 0;
        document.getElementById('stat-proj').textContent = Array.isArray(projs) ? projs.length : 0;
        document.getElementById('stat-pend').textContent = Array.isArray(reqs) ? reqs.filter(r => r.status === 'Pendente').length : 0;
        document.getElementById('stat-aprov').textContent = Array.isArray(reqs) ? reqs.filter(r => r.status === 'Aprovado').length : 0;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    function escHtml(str) { return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

    window.fecharModal = fecharModal;
});