<?php
// ─── HEADERS CORS & JSON ──────────────────────────────────────────────────
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function respond(mixed $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getBody(): object {
    $raw = file_get_contents("php://input");
    return json_decode($raw) ?: (object)[];
}

function required(object $data, array $fields): void {
    foreach ($fields as $f) {
        if (!isset($data->$f) || trim((string)$data->$f) === '') {
            respond(["error" => "Campo obrigatório ausente: $f"], 400);
        }
    }
}

// ─── ADMIN LOCAL (funciona sem banco de dados) ────────────────────────────
// Credenciais de acesso offline. Altere à vontade.
define('ADMIN_LOCAL_EMAIL', 'admin@autoreq.com');
define('ADMIN_LOCAL_SENHA', 'admin123');

// Intercepta o login ANTES de tentar abrir o banco
$_method_early = $_SERVER['REQUEST_METHOD'];
$_action_early = strtolower($_GET['action'] ?? '');
if ($_method_early === 'POST' && $_action_early === 'login') {
    $raw   = file_get_contents("php://input");
    $body_early = json_decode($raw) ?: (object)[];
    $email_try  = trim($body_early->email ?? '');
    $senha_try  = trim($body_early->senha ?? '');

    if ($email_try === ADMIN_LOCAL_EMAIL && $senha_try === ADMIN_LOCAL_SENHA) {
        respond([
            "success" => true,
            "user"    => [
                "id"    => 0,
                "nome"  => "Admin",
                "email" => ADMIN_LOCAL_EMAIL,
                "papel" => "admin",
            ],
        ]);
    }
}

// ─── CONFIGURAÇÃO DO BANCO ────────────────────────────────────────────────
$host    = "127.0.0.1";
$db_name = "autoreq";
$db_user = "root";
$db_pass = "";

try {
    $pdo = new PDO(
        "mysql:host=$host;port=3306;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
        ]
    );
} catch (PDOException $e) {
    // Banco indisponível — retorna erro amigável para rotas que precisam dele
    $pdo = null;
    if ($_method_early !== 'POST' || $_action_early !== 'login') {
        respond(["error" => "Banco de dados offline. Inicie o MySQL no XAMPP."], 503);
    }
}

// ─── MÓDULO: UPLOAD DE DIAGRAMAS EXTERNOS ────────────────────────────────────
// Inserido antes do roteamento principal para evitar conflito de $method checks.
// Rotas adicionadas:
//   POST   api.php?action=upload_diagram  (multipart/form-data)
//   GET    api.php?tipo=diagrams
//   DELETE api.php?action=diagrama

define('DIAGRAMS_UPLOAD_DIR', __DIR__ . '/uploads/diagrams/');
define('DIAGRAMS_ALLOWED_MIME', [
    'image/png', 'image/jpeg', 'image/svg+xml',
    'application/pdf', 'application/xml', 'text/xml', 'text/plain',
]);
define('DIAGRAMS_MAX_BYTES', 10 * 1024 * 1024); // 10 MB

if (!is_dir(DIAGRAMS_UPLOAD_DIR)) {
    mkdir(DIAGRAMS_UPLOAD_DIR, 0755, true);
}

// ── POST: upload de diagrama (multipart) ──────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strtolower($_GET['action'] ?? '') === 'upload_diagram') {
    // Troca o header para multipart — a função respond() já envia JSON
    $usuarioId = intval($_POST['usuario_id'] ?? 0);
    if ($usuarioId <= 0) respond(["error" => "Usuário não autenticado."], 401);

    if (empty($_FILES['diagram']) || $_FILES['diagram']['error'] !== UPLOAD_ERR_OK) {
        respond(["error" => "Nenhum arquivo recebido ou erro no upload."], 400);
    }

    $file     = $_FILES['diagram'];
    $origName = basename($file['name']);
    $tmpPath  = $file['tmp_name'];
    $size     = (int)$file['size'];
    $mimeReal = mime_content_type($tmpPath); // MIME real (não confia no cliente)

    if ($size > DIAGRAMS_MAX_BYTES) {
        respond(["error" => "Arquivo excede o limite de 10 MB."], 413);
    }
    if (!in_array($mimeReal, DIAGRAMS_ALLOWED_MIME, true)) {
        respond(["error" => "Tipo de arquivo não permitido: $mimeReal"], 415);
    }

    // Sanitiza nome e garante unicidade para evitar colisões entre projetos
    $safeBase   = preg_replace('/[^a-zA-Z0-9._\-]/', '_', $origName);
    $uniqueName = uniqid("diag_{$usuarioId}_", true) . '_' . $safeBase;
    $destPath   = DIAGRAMS_UPLOAD_DIR . $uniqueName;

    if (!move_uploaded_file($tmpPath, $destPath)) {
        respond(["error" => "Falha ao salvar o arquivo no servidor."], 500);
    }

    // Persiste referência (cria tabela via PATCH SQL se ainda não existir)
    $projetoId     = intval($_POST['projeto_id']    ?? 0) ?: null;
    $tipoDiagrama  = trim($_POST['tipo_diagrama']   ?? 'geral');
    $tiposValidos  = ['caso_uso', 'classe', 'sequencia', 'geral'];
    if (!in_array($tipoDiagrama, $tiposValidos, true)) $tipoDiagrama = 'geral';

    try {
        $stmt = $pdo->prepare("
            INSERT INTO diagrams_externos
                  (usuario_id, projeto_id, tipo_diagrama, arquivo_original, arquivo_servidor, tamanho_bytes)
            VALUES (:uid, :pid, :tipo, :orig, :srv, :sz)
        ");
        $stmt->execute([
            ':uid'  => $usuarioId,
            ':pid'  => $projetoId,
            ':tipo' => $tipoDiagrama,
            ':orig' => $origName,
            ':srv'  => $uniqueName,
            ':sz'   => $size,
        ]);
        respond([
            "success"  => true,
            "id"       => (int)$pdo->lastInsertId(),
            "filename" => $uniqueName,
            "url"      => "uploads/diagrams/{$uniqueName}",
        ]);
    } catch (PDOException $e) {
        // Tabela ainda não criada — retorna URL mesmo sem persistir no banco
        respond([
            "success"  => true,
            "id"       => null,
            "filename" => $uniqueName,
            "url"      => "uploads/diagrams/{$uniqueName}",
            "warning"  => "Arquivo salvo, mas banco não disponível: execute o SQL de criação da tabela diagrams_externos.",
        ]);
    }
}

// ── GET: listar diagramas de um projeto ───────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && strtolower($_GET['tipo'] ?? '') === 'diagrams') {
    $uid      = intval($_GET['usuario_id']    ?? 0);
    $pid      = intval($_GET['projeto_id']    ?? 0);
    $tipoFilt = trim($_GET['tipo_diagrama']   ?? '');

    try {
        $sql = "
            SELECT id, tipo_diagrama, arquivo_original, arquivo_servidor, tamanho_bytes, criado_em,
                   CONCAT('uploads/diagrams/', arquivo_servidor) AS url
            FROM   diagrams_externos
            WHERE  usuario_id = :uid
              AND  (:pid = 0 OR projeto_id = :pid2)
        ";
        $params = [':uid' => $uid, ':pid' => $pid, ':pid2' => $pid];

        if ($tipoFilt !== '') {
            $sql   .= " AND tipo_diagrama = :tipo";
            $params[':tipo'] = $tipoFilt;
        }

        $sql .= " ORDER BY criado_em DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        respond($stmt->fetchAll());
    } catch (PDOException) {
        respond([]); // tabela não existe ainda — retorna lista vazia
    }
}

// ── DELETE: remover diagrama ───────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE' && strtolower($_GET['action'] ?? '') === 'diagrama') {
    $uid = intval($_GET['usuario_id'] ?? 0);
    $id  = intval($_GET['id']         ?? 0);
    if (!$id || !$uid) respond(["error" => "Parâmetros id e usuario_id são obrigatórios."], 400);

    try {
        $stmt = $pdo->prepare(
            "SELECT arquivo_servidor FROM diagrams_externos WHERE id=:id AND usuario_id=:uid"
        );
        $stmt->execute([':id' => $id, ':uid' => $uid]);
        $row = $stmt->fetch();
        if (!$row) respond(["error" => "Diagrama não encontrado."], 404);

        $filePath = DIAGRAMS_UPLOAD_DIR . $row['arquivo_servidor'];
        if (file_exists($filePath)) unlink($filePath);

        $pdo->prepare("DELETE FROM diagrams_externos WHERE id=:id AND usuario_id=:uid")
            ->execute([':id' => $id, ':uid' => $uid]);

        respond(["success" => true]);
    } catch (PDOException $e) {
        respond(["error" => "Erro ao excluir diagrama: " . $e->getMessage()], 500);
    }
}
// /MÓDULO UPLOAD DE DIAGRAMAS EXTERNOS


// ─── ROTEAMENTO ──────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$action = strtolower($_GET['action'] ?? '');
$tipo   = strtolower($_GET['tipo']   ?? '');
$body   = ($method === 'POST' || $method === 'PUT') ? getBody() : (object)[];

// ══════════════════════════════════════════════════════════════════════════
//  POST
// ══════════════════════════════════════════════════════════════════════════
if ($method === 'POST') {

    // ── Cadastro de usuário ───────────────────────────────────────────────
    if ($action === 'cadastro') {
        required($body, ['nome', 'email', 'senha']);
        $nome  = trim($body->nome);
        $email = trim($body->email);
        $senha = trim($body->senha);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(["error" => "E-mail inválido."], 400);
        }
        if (strlen($senha) < 6) {
            respond(["error" => "A senha deve ter pelo menos 6 caracteres."], 400);
        }

        $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            respond(["error" => "Este e-mail já está cadastrado."], 409);
        }

        $hash = password_hash($senha, PASSWORD_BCRYPT);
        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (nome, email, senha, papel) VALUES (?, ?, ?, 'analista')"
        );
        $stmt->execute([$nome, $email, $hash]);
        respond(["success" => true, "message" => "Usuário cadastrado com sucesso!"]);
    }

    // ── Login ─────────────────────────────────────────────────────────────
    if ($action === 'login') {
        required($body, ['email', 'senha']);
        $email = trim($body->email);
        $senha = trim($body->senha);

        $stmt = $pdo->prepare(
            "SELECT id, nome, email, papel, senha FROM usuarios WHERE email = ? LIMIT 1"
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($senha, $user['senha'])) {
            respond(["error" => "E-mail ou senha inválidos."], 401);
        }

        try {
            $pdo->prepare("UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?")
                ->execute([$user['id']]);
        } catch (PDOException) {}

        unset($user['senha']); // nunca devolve o hash
        respond(["success" => true, "user" => $user]);
    }

    // ── Criar Projeto ─────────────────────────────────────────────────────
    if ($tipo === 'projeto' || isset($body->nome_projeto)) {
        required($body, ['nome_projeto', 'usuario_id']);
        $nome = trim($body->nome_projeto);
        if (!$nome) respond(["error" => "Nome do projeto é obrigatório."], 400);

        $stmt = $pdo->prepare(
            "INSERT INTO projetos (nome, cliente, status, descricao, usuario_id)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $nome,
            trim($body->cliente  ?? ''),
            $body->status        ?? 'Planejamento',
            trim($body->desc     ?? ''),
            (int)$body->usuario_id,
        ]);
        respond(["success" => "Projeto criado com sucesso!", "id" => (int)$pdo->lastInsertId()]);
    }

    // ── Criar Requisito ───────────────────────────────────────────────────
    if (isset($body->id_requisito_manual) || $tipo === 'requisito') {
        required($body, ['id_requisito_manual', 'titulo', 'projeto_id', 'usuario_id']);
        $codigo = trim($body->id_requisito_manual);
        $titulo = trim($body->titulo);
        $projId = (int)$body->projeto_id;

        // Verifica que o projeto pertence ao usuário
        $chk = $pdo->prepare(
            "SELECT id FROM projetos WHERE id = ? AND usuario_id = ? LIMIT 1"
        );
        $chk->execute([$projId, (int)$body->usuario_id]);
        if (!$chk->fetch()) respond(["error" => "Projeto não encontrado ou sem permissão."], 403);

        $stmt = $pdo->prepare(
            "INSERT INTO requisitos (codigo, tipo, titulo, descricao, prioridade, projeto_id, status, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?)"
        );
        $stmt->execute([
            $codigo,
            $body->tipo       ?? 'RF',
            $titulo,
            trim($body->desc       ?? ''),
            $body->prioridade ?? 'Média',
            $projId,
            (int)$body->usuario_id,
        ]);
        respond(["success" => "Requisito cadastrado com sucesso!", "id" => (int)$pdo->lastInsertId()]);
    }

    // ── Comentário ────────────────────────────────────────────────────────
    if ($action === 'comentario') {
        required($body, ['requisito_id', 'texto']);
        $stmt = $pdo->prepare(
            "INSERT INTO comentarios (requisito_id, autor, texto) VALUES (?, ?, ?)"
        );
        $stmt->execute([
            (int)$body->requisito_id,
            trim($body->autor ?? 'Usuário'),
            trim($body->texto),
        ]);
        respond(["success" => "Comentário salvo!"]);
    }

    // ── Atualizar Perfil do Usuário ───────────────────────────────────────
    if ($tipo === 'update_perfil') {
        required($body, ['usuario_id', 'nome', 'email']);
        $uid   = (int)$body->usuario_id;
        $nome  = trim($body->nome);
        $email = trim($body->email);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(["error" => "E-mail inválido."], 400);
        }

        // Verifica se o e-mail já está em uso por outro usuário
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ? AND id != ? LIMIT 1");
        $chk->execute([$email, $uid]);
        if ($chk->fetch()) {
            respond(["error" => "Este e-mail já está em uso por outro usuário."], 409);
        }

        // Monta o UPDATE dinâmico (senha é opcional)
        if (!empty($body->nova_senha)) {
            $novaSenha = trim($body->nova_senha);
            if (strlen($novaSenha) < 6) {
                respond(["error" => "A nova senha deve ter pelo menos 6 caracteres."], 400);
            }
            $hash = password_hash($novaSenha, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare(
                "UPDATE usuarios SET nome = ?, email = ?, senha = ? WHERE id = ?"
            );
            $stmt->execute([$nome, $email, $hash, $uid]);
        } else {
            $stmt = $pdo->prepare(
                "UPDATE usuarios SET nome = ?, email = ? WHERE id = ?"
            );
            $stmt->execute([$nome, $email, $uid]);
        }

        if ($stmt->rowCount() === 0) {
            respond(["error" => "Usuário não encontrado ou nenhuma alteração detectada."], 404);
        }

        respond(["success" => true, "message" => "Perfil atualizado com sucesso!"]);
    }

    respond(["error" => "Rota POST não reconhecida."], 404);
}

// ══════════════════════════════════════════════════════════════════════════
//  PUT
// ══════════════════════════════════════════════════════════════════════════
if ($method === 'PUT') {

    // ── Validar / alterar status do requisito ─────────────────────────────
    if (isset($body->requisito_id) && isset($body->novo_status)) {
        required($body, ['requisito_id', 'novo_status', 'usuario_id']);
        $reqId     = (int)$body->requisito_id;
        $uid       = (int)$body->usuario_id;
        $novoStatus = trim($body->novo_status);

        if (!in_array($novoStatus, ['Aprovado', 'Pendente', 'Revisão'])) {
            respond(["error" => "Status inválido."], 400);
        }

        $stmt = $pdo->prepare(
            "SELECT r.status FROM requisitos r
               JOIN projetos p ON p.id = r.projeto_id
              WHERE r.id = ? AND p.usuario_id = ? LIMIT 1"
        );
        $stmt->execute([$reqId, $uid]);
        $req = $stmt->fetch();

        if (!$req) respond(["error" => "Requisito não encontrado ou sem permissão."], 403);
        if (in_array($req['status'], ['Aprovado', 'Revisão'])) {
            respond(["error" => "Requisito já revisado. Status atual: {$req['status']}."], 409);
        }

        $pdo->prepare("UPDATE requisitos SET status = ?, justificativa = ? WHERE id = ?")
            ->execute([$novoStatus, trim($body->justificativa ?? ''), $reqId]);
        respond(["success" => "Status do requisito atualizado!"]);
    }

    // ── Editar Projeto ────────────────────────────────────────────────────
    if (isset($body->projeto_id) && isset($body->nome_projeto)) {
        required($body, ['projeto_id', 'nome_projeto', 'usuario_id']);
        $nome   = trim($body->nome_projeto);
        $projId = (int)$body->projeto_id;
        $uid    = (int)$body->usuario_id;

        if (!$nome) respond(["error" => "Nome do projeto é obrigatório."], 400);

        $stmt = $pdo->prepare(
            "UPDATE projetos SET nome = ?, cliente = ?, status = ?, descricao = ?
              WHERE id = ? AND usuario_id = ?"
        );
        $stmt->execute([
            $nome,
            trim($body->cliente ?? ''),
            $body->status       ?? 'Planejamento',
            trim($body->desc    ?? ''),
            $projId,
            $uid,
        ]);

        if ($stmt->rowCount() === 0) {
            respond(["error" => "Projeto não encontrado ou sem permissão."], 403);
        }
        respond(["success" => "Projeto atualizado!"]);
    }

    // ── Editar Requisito ──────────────────────────────────────────────────
    if (isset($body->req_id) && isset($body->titulo)) {
        required($body, ['req_id', 'titulo', 'usuario_id']);
        $reqId = (int)$body->req_id;
        $uid   = (int)$body->usuario_id;

        $chk = $pdo->prepare(
            "SELECT r.id FROM requisitos r
               JOIN projetos p ON p.id = r.projeto_id
              WHERE r.id = ? AND p.usuario_id = ? LIMIT 1"
        );
        $chk->execute([$reqId, $uid]);
        if (!$chk->fetch()) respond(["error" => "Sem permissão para editar este requisito."], 403);

        $pdo->prepare(
            "UPDATE requisitos SET codigo = ?, tipo = ?, titulo = ?, descricao = ?, prioridade = ?
              WHERE id = ?"
        )->execute([
            trim($body->codigo    ?? ''),
            $body->tipo           ?? 'RF',
            trim($body->titulo),
            trim($body->desc      ?? ''),
            $body->prioridade     ?? 'Média',
            $reqId,
        ]);
        respond(["success" => "Requisito atualizado!"]);
    }

    respond(["error" => "Rota PUT não reconhecida."], 404);
}

// ══════════════════════════════════════════════════════════════════════════
//  DELETE
// ══════════════════════════════════════════════════════════════════════════
if ($method === 'DELETE') {
    $id  = (int)($_GET['id']         ?? 0);
    $uid = (int)($_GET['usuario_id'] ?? 0);

    if (!$id || !$uid) respond(["error" => "Parâmetros id e usuario_id são obrigatórios."], 400);

    if ($action === 'projeto') {
        $chk = $pdo->prepare("SELECT id FROM projetos WHERE id = ? AND usuario_id = ?");
        $chk->execute([$id, $uid]);
        if (!$chk->fetch()) respond(["error" => "Projeto não encontrado ou sem permissão."], 403);

        // Cascade manual (caso FK não esteja configurada)
        $pdo->prepare(
            "DELETE FROM comentarios WHERE requisito_id IN (SELECT id FROM requisitos WHERE projeto_id = ?)"
        )->execute([$id]);
        $pdo->prepare("DELETE FROM requisitos WHERE projeto_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM projetos WHERE id = ?")->execute([$id]);
        respond(["success" => "Projeto excluído!"]);
    }

    if ($action === 'requisito') {
        $chk = $pdo->prepare(
            "SELECT r.id FROM requisitos r
               JOIN projetos p ON p.id = r.projeto_id
              WHERE r.id = ? AND p.usuario_id = ? LIMIT 1"
        );
        $chk->execute([$id, $uid]);
        if (!$chk->fetch()) respond(["error" => "Requisito não encontrado ou sem permissão."], 403);

        $pdo->prepare("DELETE FROM comentarios WHERE requisito_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM requisitos WHERE id = ?")->execute([$id]);
        respond(["success" => "Requisito excluído!"]);
    }

    respond(["error" => "Rota DELETE não reconhecida."], 404);
}

// ══════════════════════════════════════════════════════════════════════════
//  GET
// ══════════════════════════════════════════════════════════════════════════
if ($method === 'GET') {
    $uid    = (int)($_GET['usuario_id']  ?? 0);
    $projId = isset($_GET['projeto_id'])   ? (int)$_GET['projeto_id']   : null;
    $reqId  = isset($_GET['requisito_id']) ? (int)$_GET['requisito_id'] : null;

    // ── Dashboard ─────────────────────────────────────────────────────────
    if ($tipo === 'dashboard') {
        if (!$uid) respond(["error" => "usuario_id obrigatório."], 400);

        $stmt = $pdo->prepare(
            "SELECT
                COUNT(*) AS total,
                SUM(r.status = 'Pendente')  AS pendentes,
                SUM(r.status = 'Aprovado')  AS aprovados,
                SUM(r.status = 'Revisão')   AS em_revisao
             FROM requisitos r
             JOIN projetos p ON p.id = r.projeto_id
             WHERE p.usuario_id = ?"
        );
        $stmt->execute([$uid]);
        $stats = $stmt->fetch();

        $stmtProj = $pdo->prepare("SELECT COUNT(*) AS total FROM projetos WHERE usuario_id = ?");
        $stmtProj->execute([$uid]);
        $projCount = $stmtProj->fetch();

        respond([
            "requisitos"  => (int)$stats['total'],
            "pendentes"   => (int)$stats['pendentes'],
            "aprovados"   => (int)$stats['aprovados'],
            "em_revisao"  => (int)$stats['em_revisao'],
            "projetos"    => (int)$projCount['total'],
        ]);
    }

    // ── Listar Projetos ───────────────────────────────────────────────────
    if ($tipo === 'projetos') {
        if (!$uid) respond(["error" => "usuario_id obrigatório."], 400);
        $stmt = $pdo->prepare(
            "SELECT * FROM projetos WHERE usuario_id = ? ORDER BY data_criacao DESC"
        );
        $stmt->execute([$uid]);
        respond($stmt->fetchAll());
    }

    // ── Listar Requisitos (com filtros) ───────────────────────────────────
    if ($tipo === 'requisitos') {
        if (!$uid) respond(["error" => "usuario_id obrigatório."], 400);

        $where  = ["p.usuario_id = ?"];
        $params = [$uid];

        if ($projId) {
            $where[]  = "r.projeto_id = ?";
            $params[] = $projId;
        }
        foreach (['filtro_tipo' => 'r.tipo', 'filtro_status' => 'r.status', 'filtro_prioridade' => 'r.prioridade'] as $param => $col) {
            if (!empty($_GET[$param])) {
                $where[]  = "$col = ?";
                $params[] = $_GET[$param];
            }
        }

        $sql  = "SELECT r.* FROM requisitos r
                   JOIN projetos p ON p.id = r.projeto_id
                  WHERE " . implode(" AND ", $where) . "
                  ORDER BY r.data_criacao DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        respond($stmt->fetchAll());
    }

    // ── Comentários ───────────────────────────────────────────────────────
    if ($tipo === 'comentarios' && $reqId) {
        $stmt = $pdo->prepare(
            "SELECT * FROM comentarios WHERE requisito_id = ? ORDER BY criado_em ASC"
        );
        $stmt->execute([$reqId]);
        respond($stmt->fetchAll());
    }

    respond(["error" => "Rota GET não reconhecida."], 404);
}

respond(["error" => "Método HTTP não suportado."], 405);
