<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type");

$host     = "localhost";
$db_name  = "DB_AutoReq";
$username = "root";
$password = "";

try {
    $conn = new PDO("mysql:host=$host;dbname=$db_name", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode(["error" => $e->getMessage()]);
    exit;
}

// Garante que a coluna usuario_id existe nas tabelas (executa uma vez, ignora se já existir)
try { $conn->exec("ALTER TABLE projetos  ADD COLUMN usuario_id INT NOT NULL DEFAULT 0"); } catch (PDOException $e) {}
try { $conn->exec("ALTER TABLE requisitos ADD COLUMN usuario_id INT NOT NULL DEFAULT 0"); } catch (PDOException $e) {}

$data   = json_decode(file_get_contents("php://input"));
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
            try {
                $conn->prepare("UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?")
                     ->execute([$user['id']]);
            } catch (PDOException $e) { /* coluna opcional */ }
            echo json_encode(["success" => true, "user" => $user]);
        } else {
            echo json_encode(["error" => "E-mail ou senha inválidos."]);
        }
        exit;
    }

    // [RF01] – Criar Projeto  (agora salva usuario_id)
    if (isset($data->nome_projeto)) {
        if (empty($data->nome_projeto)) {
            echo json_encode(["error" => "Nome do projeto é obrigatório."]);
            exit;
        }
        $usuario_id = intval($data->usuario_id ?? 0);
        $stmt = $conn->prepare(
            "INSERT INTO projetos (nome, cliente, status, descricao, usuario_id)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $data->nome_projeto,
            $data->cliente  ?? '',
            $data->status   ?? 'Planejamento',
            $data->desc     ?? '',
            $usuario_id
        ]);
        echo json_encode(["success" => "Projeto criado com sucesso!", "id" => $conn->lastInsertId()]);
        exit;
    }

    // [RF02] – Cadastro de Requisito  (agora salva usuario_id)
    if (isset($data->id_requisito_manual)) {
        if (empty($data->id_requisito_manual) || empty($data->titulo) || empty($data->projeto_id)) {
            echo json_encode(["error" => "Campos obrigatórios não preenchidos."]);
            exit;
        }
        $usuario_id = intval($data->usuario_id ?? 0);
        $stmt = $conn->prepare(
            "INSERT INTO requisitos (codigo, tipo, titulo, descricao, prioridade, projeto_id, status, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?)"
        );
        $stmt->execute([
            $data->id_requisito_manual,
            $data->tipo,
            $data->titulo,
            $data->desc       ?? '',
            $data->prioridade ?? 'Média',
            $data->projeto_id,
            $usuario_id
        ]);
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
    // Garante que só o dono do projeto pode validar
    if (isset($data->requisito_id) && isset($data->novo_status)) {
        $usuario_id = intval($data->usuario_id ?? 0);
        $stmt = $conn->prepare("SELECT r.status FROM requisitos r
                                 JOIN projetos p ON p.id = r.projeto_id
                                WHERE r.id = ? AND p.usuario_id = ?");
        $stmt->execute([$data->requisito_id, $usuario_id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req) {
            echo json_encode(["error" => "Requisito não encontrado ou sem permissão."]);
            exit;
        }
        if (in_array($req['status'], ['Aprovado', 'Revisão'])) {
            echo json_encode(["error" => "Requisito já revisado."]);
            exit;
        }
        $stmt = $conn->prepare("UPDATE requisitos SET status = ?, justificativa = ? WHERE id = ?");
        $stmt->execute([$data->novo_status, $data->justificativa ?? '', $data->requisito_id]);
        echo json_encode(["success" => "Status do requisito atualizado!"]);
        exit;
    }

    // [RF01/SF01.1] – Edição de Projeto  (só o dono pode editar)
    if (isset($data->projeto_id) && isset($data->nome_projeto)) {
        $usuario_id = intval($data->usuario_id ?? 0);
        $stmt = $conn->prepare(
            "UPDATE projetos SET nome = ?, cliente = ?, status = ?, descricao = ?
              WHERE id = ? AND usuario_id = ?"
        );
        $stmt->execute([
            $data->nome_projeto,
            $data->cliente ?? '',
            $data->status,
            $data->desc    ?? '',
            $data->projeto_id,
            $usuario_id
        ]);
        echo json_encode(["success" => "Projeto atualizado!"]);
        exit;
    }

    // [SF02.1] – Edição de Requisito  (só o dono do projeto pode editar)
    if (isset($data->req_id) && isset($data->titulo)) {
        $usuario_id = intval($data->usuario_id ?? 0);
        // Verifica se o requisito pertence a um projeto do usuário
        $check = $conn->prepare("SELECT r.id FROM requisitos r
                                   JOIN projetos p ON p.id = r.projeto_id
                                  WHERE r.id = ? AND p.usuario_id = ?");
        $check->execute([$data->req_id, $usuario_id]);
        if (!$check->fetch()) {
            echo json_encode(["error" => "Sem permissão para editar este requisito."]);
            exit;
        }
        $stmt = $conn->prepare(
            "UPDATE requisitos SET codigo = ?, tipo = ?, titulo = ?, descricao = ?, prioridade = ?
              WHERE id = ?"
        );
        $stmt->execute([
            $data->codigo,
            $data->tipo,
            $data->titulo,
            $data->desc       ?? '',
            $data->prioridade ?? 'Média',
            $data->req_id
        ]);
        echo json_encode(["success" => "Requisito atualizado!"]);
        exit;
    }

    echo json_encode(["error" => "Ação PUT não reconhecida."]);
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
if ($method === 'DELETE') {

    // [FA01.3] – Excluir Projeto  (só o dono pode excluir)
    if ($action === 'projeto') {
        $id         = $_GET['id']          ?? null;
        $usuario_id = intval($_GET['usuario_id'] ?? 0);
        if (!$id) { echo json_encode(["error" => "ID inválido."]); exit; }

        // Confirma que o projeto pertence ao usuário
        $check = $conn->prepare("SELECT id FROM projetos WHERE id = ? AND usuario_id = ?");
        $check->execute([$id, $usuario_id]);
        if (!$check->fetch()) {
            echo json_encode(["error" => "Projeto não encontrado ou sem permissão."]);
            exit;
        }

        $conn->prepare("DELETE FROM comentarios WHERE requisito_id IN (SELECT id FROM requisitos WHERE projeto_id = ?)")->execute([$id]);
        $conn->prepare("DELETE FROM requisitos WHERE projeto_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM projetos WHERE id = ?")->execute([$id]);
        echo json_encode(["success" => "Projeto excluído!"]);
        exit;
    }

    // Excluir Requisito  (só o dono do projeto pode excluir)
    if ($action === 'requisito') {
        $id         = $_GET['id']          ?? null;
        $usuario_id = intval($_GET['usuario_id'] ?? 0);
        if (!$id) { echo json_encode(["error" => "ID inválido."]); exit; }

        $check = $conn->prepare("SELECT r.id FROM requisitos r
                                   JOIN projetos p ON p.id = r.projeto_id
                                  WHERE r.id = ? AND p.usuario_id = ?");
        $check->execute([$id, $usuario_id]);
        if (!$check->fetch()) {
            echo json_encode(["error" => "Requisito não encontrado ou sem permissão."]);
            exit;
        }

        $conn->prepare("DELETE FROM comentarios WHERE requisito_id = ?")->execute([$id]);
        $conn->prepare("DELETE FROM requisitos WHERE id = ?")->execute([$id]);
        echo json_encode(["success" => "Requisito excluído!"]);
        exit;
    }

    echo json_encode(["error" => "Ação DELETE não reconhecida."]);
}

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $tipo       = $_GET['tipo']        ?? 'requisitos';
    $proj_id    = $_GET['projeto_id']  ?? null;
    $req_id     = $_GET['requisito_id'] ?? null;
    $usuario_id = intval($_GET['usuario_id'] ?? 0);

    // Listar projetos  (somente os do usuário logado)
    if ($tipo === 'projetos') {
        if (!$usuario_id) {
            echo json_encode(["error" => "usuario_id obrigatório."]);
            exit;
        }
        $stmt = $conn->prepare("SELECT * FROM projetos WHERE usuario_id = ? ORDER BY data_criacao DESC");
        $stmt->execute([$usuario_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    // Listar requisitos  (filtra pelos projetos do usuário + filtros opcionais)
    if ($tipo === 'requisitos') {
        $where  = ["p.usuario_id = ?"];
        $params = [$usuario_id];

        if ($proj_id)                        { $where[] = "r.projeto_id = ?";   $params[] = $proj_id; }
        if (!empty($_GET['filtro_tipo']))     { $where[] = "r.tipo = ?";         $params[] = $_GET['filtro_tipo']; }
        if (!empty($_GET['filtro_status']))   { $where[] = "r.status = ?";       $params[] = $_GET['filtro_status']; }
        if (!empty($_GET['filtro_prioridade'])) { $where[] = "r.prioridade = ?"; $params[] = $_GET['filtro_prioridade']; }

        $sql  = "SELECT r.* FROM requisitos r
                   JOIN projetos p ON p.id = r.projeto_id
                  WHERE " . implode(" AND ", $where) . "
                  ORDER BY r.data_criacao DESC";
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
