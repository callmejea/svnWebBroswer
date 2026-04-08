<?php
/**
 * SVN Web Tool - Backend API
 *
 * 这段代码处理来自前端的请求，执行 `svn list` 命令，
 * 然后将 SVN 的 XML 输出解析为 JSON 并返回给前端。
 */

header('Content-Type: application/json; charset=utf-8');

// 只允许 POST 请求
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

// 读取 JSON 格式的输入
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body']);
    exit;
}

$targetUrl = $input['targetUrl'] ?? '';
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';
$action = $input['action'] ?? 'list';

if (empty($targetUrl)) {
    http_response_code(400);
    echo json_encode(['error' => 'SVN Target URL is required']);
    exit;
}

// 确保命令安全，转义用户输入
$cmdTargetUrl = escapeshellarg($targetUrl);

// 构建 svn 命令，设置 --non-interactive 避免卡主，--no-auth-cache 不保留凭证
if ($action === 'cat') {
    $command = "svn cat $cmdTargetUrl --non-interactive --no-auth-cache";
} else {
    // 默认 list, --xml 输出规范格式，方便精准解析
    $command = "svn list --xml $cmdTargetUrl --non-interactive --no-auth-cache";
}

if (!empty($username)) {
    $command .= " --username " . escapeshellarg($username);
}

if (!empty($password)) {
    $command .= " --password " . escapeshellarg($password);
}

// 使用 proc_open 执行命令以获取标准输出和标准错误
$descriptorspec = array(
    0 => array("pipe", "r"),  // stdin
    1 => array("pipe", "w"),  // stdout
    2 => array("pipe", "w")   // stderr
);

$process = proc_open($command, $descriptorspec, $pipes);

if (is_resource($process)) {
    // 不向 stdin 写入任何内容
    fclose($pipes[0]);

    // 读取标准输出和标准错误
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);

    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);

    $returnCode = proc_close($process);

    if ($returnCode !== 0) {
        http_response_code(400);
        $errorMsg = trim($stderr) ?: trim($stdout);
        // 有些提示包含换行或多余空格
        echo json_encode(['error' => 'SVN 命令执行失败: ' . $errorMsg]);
        exit;
    }

    if ($action === 'cat') {
        echo json_encode([
            'success' => true,
            'content' => $stdout
        ]);
        exit;
    }

    try {
        // 关闭报错以便使用 try/catch 能够处理 XML 错误
        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($stdout);

        if ($xml === false) {
            $errors = libxml_get_errors();
            $errorString = '';
            foreach ($errors as $error) {
                $errorString .= trim($error->message) . "\n";
            }
            libxml_clear_errors();
            throw new Exception("解析 XML 失败: " . $errorString);
        }

        $entries = [];

        // 遍历 list 下拉的所有 entry
        if (isset($xml->list->entry)) {
            foreach ($xml->list->entry as $entry) {
                $entries[] = [
                    'kind' => (string)$entry['kind'], // 'dir' 或 'file'
                    'name' => (string)$entry->name,
                    'size' => isset($entry->size) ? (int)$entry->size : 0,
                    'author' => isset($entry->commit->author) ? (string)$entry->commit->author : '',
                    'date' => isset($entry->commit->date) ? (string)$entry->commit->date : '',
                    'revision' => isset($entry->commit['revision']) ? (string)$entry->commit['revision'] : '',
                ];
            }
        }

        // 可以考虑先按文件夹、文件进行排序，让文件夹显示在前面
        usort($entries, function($a, $b) {
            if ($a['kind'] === $b['kind']) {
                return strcasecmp($a['name'], $b['name']);
            }
            return ($a['kind'] === 'dir') ? -1 : 1; // 'dir' 排在 'file' 之前
        });

        echo json_encode([
            'success' => true,
            'entries' => $entries
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => '数据解析异常: ' . $e->getMessage()]);
    }
} else {
    http_response_code(500);
    echo json_encode(['error' => '无法在服务器上执行 SVN 命令']);
}
