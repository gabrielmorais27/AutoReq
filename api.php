<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type");

$host = "localhost";
$db_name = "DB_AutoReq";
$username = "root";
$password = "";

try {
    $conn = new PDO("mysql:host=$host;dbname=$db_name", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    echo json_encode(["error" => $e->getMessage()]);
    exit;
}

$data = json_decode(file_get_contents("php://input"));
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ─── POST ────────────────────────────────────────────────────────────────────
if ($method === 'POST') {

    // [RF03] – Login de Usuário
    if ($action === 'login') {
        if (empty($data->email) || empty($data->senha)) {
            echo json_encode(["error" => "Preencha e-mail e senha."]);
            exit;
        }
        $stmt = $conn->prepare("SELECT id, nome, papel, email FROM usuarios WHERE email = ? AND senha = ?");
        $stmt->execute([$data->email, md5($data->senha)]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            // Atualizar ultimo_acesso (coluna opcional — ignora erro se não existir)
            try {
                $conn->prepare("UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?")
                     ->execute([$user['id']]);
            } catch (PDOException $e) { /* coluna não existe ainda, ignora */ }
            echo json_encode(["success" => true, "user" => $user]);
        } else {
            echo json_encode(["error" => "E-mail ou senha inválidos."]);
        }
        exit;
    }

    // [RF01] – Criar Projeto
    if (isset($data->nome_projeto)) {
        if (empty($data->nome_projeto)) {
            echo json_encode(["error" => "Nome do projeto é obrigatório."]);
            exit;
        }
        $stmt = $conn->prepare("INSERT INTO projetos (nome, cliente, status, descricao) VALUES (?, ?, ?, ?)");
        $stmt->execute([$data->nome_projeto, $data->cliente ?? '', $data->status ?? 'Planejamento', $data->desc ?? '']);
        echo json_encode(["success" => "Projeto criado com sucesso!", "id" => $conn->lastInsertId()]);
        exit;
    }

    // [RF02] – Cadastro de Requisito (com prioridade)
    if (isset($data->id_requisito_manual)) {
        if (empty($data->id_requisito_manual) || empty($data->titulo) || empty($data->projeto_id)) {
            echo json_encode(["error" => "Campos obrigatórios não preenchidos."]);
            exit;
        }
        $stmt = $conn->prepare("INSERT INTO requisitos (codigo, tipo, titulo, descricao, prioridade, projeto_id, status) VALUES (?, ?, ?, ?, ?, ?, 'Pendente')");
        $stmt->execute([$data->id_requisito_manual, $data->tipo, $data->titulo, $data->desc ?? '', $data->prioridade ?? 'Média', $data->projeto_id]);
        echo json_encode(["success" => "Requisito cadastrado com sucesso!", "id" => $conn->lastInsertId()]);
        exit;
    }

    // [RF07] – Salvar Comentário
    if ($action === 'comentario') {
        if (empty($data->requisito_id) || empty($data->texto)) {
            echo json_encode(["error" => "Dados incompletos para comentário."]);
            exit;
        }
        $stmt = $conn->prepare("INSERT INTO comentarios (requisito_id, autor, texto) VALUES (?, ?, ?)");
        $stmt->execute([$data->requisito_id, $data->autor ?? 'Usuário', $data->texto]);
        echo json_encode(["success" => "Comentário salvo!"]);
        exit;
    }

    echo json_encode(["error" => "Ação POST não reconhecida."]);
}

// ─── PUT ─────────────────────────────────────────────────────────────────────
if ($method === 'PUT') {

    // [RF05] – Validação de Requisito (Aprovar / Solicitar Revisão)
    if (isset($data->requisito_id) && isset($data->novo_status)) {
        $stmt = $conn->prepare("SELECT status FROM requisitos WHERE id = ?");
        $stmt->execute([$data->requisito_id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($req && in_array($req['status'], ['Aprovado', 'Revisão'])) {
            echo json_encode(["error" => "Requisito já revisado."]);
            exit;
        }
        $stmt = $conn->prepare("UPDATE requisitos SET status = ?, justificativa = ? WHERE id = ?");
        $stmt->execute([$data->novo_status, $data->justificativa ?? '', $data->requisito_id]);
        echo json_encode(["success" => "Status do requisito atualizado!"]);
        exit;
    }

    // [RF01/SF01.1] – Edição de Projeto
    if (isset($data->projeto_id) && isset($data->nome_projeto)) {
        $stmt = $conn->prepare("UPDATE projetos SET nome = ?, cliente = ?, status = ?, descricao = ? WHERE id = ?");
        $stmt->execute([$data->nome_projeto, $data->cliente ?? '', $data->status, $data->desc ?? '', $data->projeto_id]);
        echo json_encode(["success" => "Projeto atualizado!"]);
        exit;
    }

    // [SF02.1] – Edição de Requisito
    if (isset($data->req_id) && isset($data->titulo)) {
        $stmt = $conn->prepare("UPDATE requisitos SET codigo = ?, tipo = ?, titulo = ?, descricao = ?, prioridade = ? WHERE id = ?");
        $stmt->execute([$data->codigo, $data->tipo, $data->titulo, $data->desc ?? '', $data->prioridade ?? 'Média', $data->req_id]);
        echo json_encode(["success" => "Requisito atualizado!"]);
        exit;
    }

    echo json_encode(["error" => "Ação PUT não reconhecida."]);
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
if ($method === 'DELETE') {

    // [FA01.3] – Excluir Projeto
    if ($action === 'projeto') {
        $id = $_GET['id'] ?? null;
        if (!$id) { echo json_encode(["error" => "ID inválido."]); exit; }
        $conn->prepare("DELETE FROM comentarios WHERE requisito_id IN (SELECT id FROM requisitos WHERE projeto_id = ?)")->execute([$id]);
        $conn->prepare("DELETE FROM requisitos WHERE projeto_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM projetos WHERE id = ?")->execute([$id]);
        echo json_encode(["success" => "Projeto excluído!"]);
        exit;
    }

    // Excluir Requisito
    if ($action === 'requisito') {
        $id = $_GET['id'] ?? null;
        if (!$id) { echo json_encode(["error" => "ID inválido."]); exit; }
        $conn->prepare("DELETE FROM comentarios WHERE requisito_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM requisitos WHERE id = ?")->execute([$id]);
        echo json_encode(["success" => "Requisito excluído!"]);
        exit;
    }

    echo json_encode(["error" => "Ação DELETE não reconhecida."]);
}

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $tipo    = $_GET['tipo']       ?? 'requisitos';
    $proj_id = $_GET['projeto_id'] ?? null;
    $req_id  = $_GET['requisito_id'] ?? null;

    // Listar projetos
    if ($tipo === 'projetos') {
        $stmt = $conn->query("SELECT * FROM projetos ORDER BY data_criacao DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    // Listar requisitos (com filtros SF04.1)
    if ($tipo === 'requisitos') {
        $where = [];
        $params = [];
        if ($proj_id)                   { $where[] = "projeto_id = ?"; $params[] = $proj_id; }
        if (!empty($_GET['filtro_tipo'])) { $where[] = "tipo = ?";       $params[] = $_GET['filtro_tipo']; }
        if (!empty($_GET['filtro_status'])) { $where[] = "status = ?";  $params[] = $_GET['filtro_status']; }
        if (!empty($_GET['filtro_prioridade'])) { $where[] = "prioridade = ?"; $params[] = $_GET['filtro_prioridade']; }
        $sql = "SELECT * FROM requisitos" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY data_criacao DESC";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    // [RF07] – Buscar comentários de um requisito
    if ($tipo === 'comentarios' && $req_id) {
        $stmt = $conn->prepare("SELECT * FROM comentarios WHERE requisito_id = ? ORDER BY criado_em ASC");
        $stmt->execute([$req_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    echo json_encode(["error" => "Tipo não reconhecido."]);
}
?>