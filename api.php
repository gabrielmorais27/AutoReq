<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Responde pre-flight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── CONFIGURAÇÃO AWS ──────────────────────────────────────────────────────
$host     = "autoreq-db.c4l0m13gb9vw.us-east-1.rds.amazonaws.com";
$db_name  = "AutoReq";
$username = "admin";
$password = "SUA_SENHA_AQUI"; // <-- coloque sua senha aqui

try {
    $conn = new PDO(
        "mysql:host=$host;port=3306;dbname=$db_name;charset=utf8mb4",
        $username, $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
         PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"]
    );
} catch (PDOException $e) {
    http_response_code(503);
    echo json_encode(["error" => "Erro de conexão com o banco: " . $e->getMessage()]);
    exit;
}

// Garante colunas necessárias (executa uma vez silenciosamente)
foreach ([
    "ALTER TABLE projetos ADD COLUMN IF NOT EXISTS usuario_id INT NOT NULL DEFAULT 0",
    "ALTER TABLE requisitos ADD COLUMN IF NOT EXISTS usuario_id INT NOT NULL DEFAULT 0",
    "ALTER TABLE requisitos ADD COLUMN IF NOT EXISTS justificativa TEXT",
] as $sql) {
    try { $conn->exec($sql); } catch (PDOException $e) { /* ignora se já existir */ }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getBody(): object {
    $raw = file_get_contents("php://input");
    return json_decode($raw) ?: (object)[];
}

$data   = getBody();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ─── POST ─────────────────────────────────────────────────────────────────
if ($method === 'POST') {

    // Login [RF03]
    if ($action === 'login') {
        if (empty($data->email) || empty($data->senha)) {
            respond(["error" => "Preencha e-mail e senha."], 400);
        }
        $stmt = $conn->prepare(
            "SELECT id, nome, papel, email FROM usuarios
              WHERE email = ? AND senha = ? LIMIT 1"
        );
        $stmt->execute([trim($data->email), md5($data->senha)]);
        $user = $stmt->fetch();

        if (!$user) {
            respond(["error" => "E-mail ou senha inválidos."], 401);
        }

        // Atualiza último acesso (ignora se coluna não existir)
        try {
            $conn->prepare("UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?")
                 ->execute([$user['id']]);
        } catch (PDOException $e) {}

        respond(["success" => true, "user" => $user]);
    }

    // Criar Projeto [RF01]
    if (isset($data->nome_projeto)) {
        $nome = trim($data->nome_projeto ?? '');
        if (!$nome) respond(["error" => "Nome do projeto é obrigatório."], 400);

        $stmt = $conn->prepare(
            "INSERT INTO projetos (nome, cliente, status, descricao, usuario_id)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $nome,
            trim($data->cliente  ?? ''),
            $data->status        ?? 'Planejamento',
            trim($data->desc     ?? ''),
            intval($data->usuario_id ?? 0)
        ]);
        respond(["success" => "Projeto criado com sucesso!", "id" => (int)$conn->lastInsertId()]);
    }

    // Cadastrar Requisito [RF02]
    if (isset($data->id_requisito_manual)) {
        $codigo = trim($data->id_requisito_manual ?? '');
        $titulo = trim($data->titulo ?? '');
        $projId = intval($data->projeto_id ?? 0);

        if (!$codigo || !$titulo || !$projId) {
            respond(["error" => "Campos obrigatórios não preenchidos."], 400);
        }

        $stmt = $conn->prepare(
            "INSERT INTO requisitos (codigo, tipo, titulo, descricao, prioridade, projeto_id, status, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?)"
        );
        $stmt->execute([
            $codigo,
            $data->tipo       ?? 'RF',
            $titulo,
            trim($data->desc       ?? ''),
            $data->prioridade ?? 'Média',
            $projId,
            intval($data->usuario_id ?? 0)
        ]);
        respond(["success" => "Requisito cadastrado com sucesso!", "id" => (int)$conn->lastInsertId()]);
    }

    // Salvar Comentário [RF07]
    if ($action === 'comentario') {
        if (empty($data->requisito_id) || empty($data->texto)) {
            respond(["error" => "Dados incompletos para comentário."], 400);
        }
        $stmt = $conn->prepare(
            "INSERT INTO comentarios (requisito_id, autor, texto) VALUES (?, ?, ?)"
        );
        $stmt->execute([
            intval($data->requisito_id),
            trim($data->autor ?? 'Usuário'),
            trim($data->texto)
        ]);
        respond(["success" => "Comentário salvo!"]);
    }

    respond(["error" => "Ação POST não reconhecida."], 400);
}

// ─── PUT ──────────────────────────────────────────────────────────────────
if ($method === 'PUT') {

    // Validar Requisito [RF05]
    if (isset($data->requisito_id) && isset($data->novo_status)) {
        $reqId      = intval($data->requisito_id);
        $usuarioId  = intval($data->usuario_id ?? 0);
        $novoStatus = trim($data->novo_status);

        $statusValidos = ['Aprovado', 'Pendente', 'Revisão'];
        if (!in_array($novoStatus, $statusValidos)) {
            respond(["error" => "Status inválido."], 400);
        }

        // Verifica permissão via projeto dono
        $stmt = $conn->prepare(
            "SELECT r.status FROM requisitos r
               JOIN projetos p ON p.id = r.projeto_id
              WHERE r.id = ? AND p.usuario_id = ? LIMIT 1"
        );
        $stmt->execute([$reqId, $usuarioId]);
        $req = $stmt->fetch();

        if (!$req) respond(["error" => "Requisito não encontrado ou sem permissão."], 403);
        if (in_array($req['status'], ['Aprovado', 'Revisão'])) {
            respond(["error" => "Requisito já revisado. Status atual: {$req['status']}."], 409);
        }

        $conn->prepare("UPDATE requisitos SET status = ?, justificativa = ? WHERE id = ?")
             ->execute([$novoStatus, trim($data->justificativa ?? ''), $reqId]);
        respond(["success" => "Status do requisito atualizado!"]);
    }

    // Editar Projeto [RF01/SF01.1]
    if (isset($data->projeto_id) && isset($data->nome_projeto)) {
        $nome      = trim($data->nome_projeto ?? '');
        $projId    = intval($data->projeto_id);
        $usuarioId = intval($data->usuario_id ?? 0);

        if (!$nome) respond(["error" => "Nome do projeto é obrigatório."], 400);

        $stmt = $conn->prepare(
            "UPDATE projetos SET nome = ?, cliente = ?, status = ?, descricao = ?
              WHERE id = ? AND usuario_id = ?"
        );
        $stmt->execute([
            $nome,
            trim($data->cliente ?? ''),
            $data->status       ?? 'Planejamento',
            trim($data->desc    ?? ''),
            $projId, $usuarioId
        ]);

        if ($stmt->rowCount() === 0) {
            respond(["error" => "Projeto não encontrado ou sem permissão."], 403);
        }
        respond(["success" => "Projeto atualizado!"]);
    }

    // Editar Requisito [SF02.1]
    if (isset($data->req_id) && isset($data->titulo)) {
        $reqId     = intval($data->req_id);
        $usuarioId = intval($data->usuario_id ?? 0);

        $check = $conn->prepare(
            "SELECT r.id FROM requisitos r
               JOIN projetos p ON p.id = r.projeto_id
              WHERE r.id = ? AND p.usuario_id = ? LIMIT 1"
        );
        $check->execute([$reqId, $usuarioId]);
        if (!$check->fetch()) respond(["error" => "Sem permissão para editar este requisito."], 403);

        $stmt = $conn->prepare(
            "UPDATE requisitos SET codigo = ?, tipo = ?, titulo = ?, descricao = ?, prioridade = ?
              WHERE id = ?"
        );
        $stmt->execute([
            trim($data->codigo    ?? ''),
            $data->tipo           ?? 'RF',
            trim($data->titulo),
            trim($data->desc      ?? ''),
            $data->prioridade     ?? 'Média',
            $reqId
        ]);
        respond(["success" => "Requisito atualizado!"]);
    }

    respond(["error" => "Ação PUT não reconhecida."], 400);
}

// ─── DELETE ───────────────────────────────────────────────────────────────
if ($method === 'DELETE') {

    $id         = intval($_GET['id'] ?? 0);
    $usuarioId  = intval($_GET['usuario_id'] ?? 0);

    if ($action === 'projeto') {
        if (!$id) respond(["error" => "ID inválido."], 400);

        $check = $conn->prepare("SELECT id FROM projetos WHERE id = ? AND usuario_id = ?");
        $check->execute([$id, $usuarioId]);
        if (!$check->fetch()) respond(["error" => "Projeto não encontrado ou sem permissão."], 403);

        $conn->prepare(
            "DELETE FROM comentarios WHERE requisito_id IN (SELECT id FROM requisitos WHERE projeto_id = ?)"
        )->execute([$id]);
        $conn->prepare("DELETE FROM requisitos WHERE projeto_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM projetos WHERE id = ?")->execute([$id]);
        respond(["success" => "Projeto excluído!"]);
    }

    if ($action === 'requisito') {
        if (!$id) respond(["error" => "ID inválido."], 400);

        $check = $conn->prepare(
            "SELECT r.id FROM requisitos r
               JOIN projetos p ON p.id = r.projeto_id
              WHERE r.id = ? AND p.usuario_id = ? LIMIT 1"
        );
        $check->execute([$id, $usuarioId]);
        if (!$check->fetch()) respond(["error" => "Requisito não encontrado ou sem permissão."], 403);

        $conn->prepare("DELETE FROM comentarios WHERE requisito_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM requisitos WHERE id = ?")->execute([$id]);
        respond(["success" => "Requisito excluído!"]);
    }

    respond(["error" => "Ação DELETE não reconhecida."], 400);
}

// ─── GET ──────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $tipo       = $_GET['tipo']         ?? 'requisitos';
    $projId     = isset($_GET['projeto_id'])  ? intval($_GET['projeto_id'])  : null;
    $reqId      = isset($_GET['requisito_id']) ? intval($_GET['requisito_id']) : null;
    $usuarioId  = intval($_GET['usuario_id'] ?? 0);

    if ($tipo === 'projetos') {
        if (!$usuarioId) respond(["error" => "usuario_id obrigatório."], 400);
        $stmt = $conn->prepare(
            "SELECT * FROM projetos WHERE usuario_id = ? ORDER BY data_criacao DESC"
        );
        $stmt->execute([$usuarioId]);
        respond($stmt->fetchAll());
    }

    if ($tipo === 'requisitos') {
        $where  = ["p.usuario_id = ?"];
        $params = [$usuarioId];

        if ($projId)                               { $where[] = "r.projeto_id = ?";   $params[] = $projId; }
        if (!empty($_GET['filtro_tipo']))          { $where[] = "r.tipo = ?";          $params[] = $_GET['filtro_tipo']; }
        if (!empty($_GET['filtro_status']))        { $where[] = "r.status = ?";        $params[] = $_GET['filtro_status']; }
        if (!empty($_GET['filtro_prioridade']))    { $where[] = "r.prioridade = ?";    $params[] = $_GET['filtro_prioridade']; }

        $sql  = "SELECT r.* FROM requisitos r
                   JOIN projetos p ON p.id = r.projeto_id
                  WHERE " . implode(" AND ", $where) . "
                  ORDER BY r.data_criacao DESC";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        respond($stmt->fetchAll());
    }

    if ($tipo === 'comentarios' && $reqId) {
        $stmt = $conn->prepare(
            "SELECT * FROM comentarios WHERE requisito_id = ? ORDER BY criado_em ASC"
        );
        $stmt->execute([$reqId]);
        respond($stmt->fetchAll());
    }

    respond(["error" => "Tipo não reconhecido."], 400);
}
?>
