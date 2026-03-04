<?php
declare(strict_types=1);

$status = (int)($_SERVER['REDIRECT_STATUS'] ?? 404);
if (!in_array($status, [403, 404], true)) {
    $status = 404;
}

http_response_code($status);

$title = $status === 403 ? 'Access Denied' : 'Page Not Found';
$message = $status === 403
    ? "You do not have permission to access this page."
    : "The page you requested does not exist.";

$requestUri = (string)($_SERVER['REQUEST_URI'] ?? '/');
$backendPos = stripos($requestUri, '/backend');
$homePath = '/';
$projectBasePath = '';
if ($backendPos !== false) {
    $projectBasePath = rtrim(substr($requestUri, 0, $backendPos), '/');
}

if ($projectBasePath === '') {
    $projectBasePath = '/val-track';
}

if (is_file(__DIR__ . '/../build/index.html')) {
    $homePath = $projectBasePath . '/build/index.html';
} else {
    $homePath = $projectBasePath . '/';
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?php echo htmlspecialchars((string)$status . ' ' . $title, ENT_QUOTES, 'UTF-8'); ?></title>
  <style>
    :root {
      --bg: #0c0e10;
      --s1: #12151a;
      --s2: #181c22;
      --border: rgba(255, 255, 255, 0.07);
      --border2: rgba(255, 255, 255, 0.13);
      --red: #e8253c;
      --red-dim: rgba(232, 37, 60, 0.18);
      --text: #e8eaf0;
      --text2: #8a93a6;
      --text3: #454e60;
      --mono: "DM Mono", monospace;
      --display: "Century Gothic", "AppleGothic", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
      font-family: var(--display);
      background:
        radial-gradient(900px 420px at 85% 5%, rgba(232, 37, 60, 0.07) 0%, transparent 55%),
        radial-gradient(760px 380px at 10% 90%, rgba(255, 255, 255, 0.04) 0%, transparent 60%),
        var(--bg);
      color: var(--text); 
    }
    .card {
      width: 100%;
      max-width: 760px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)), var(--s1);
      box-shadow: 0 20px 46px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.18);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 800;
    }
    .tri {
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 14px solid var(--red);
      filter: drop-shadow(0 0 8px rgba(232, 37, 60, 0.45));
    }
    .code {
      border: 1px solid rgba(232, 37, 60, 0.45);
      background: var(--red-dim);
      color: var(--red);
      border-radius: 999px;
      padding: 4px 10px;
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
    }
    .body { padding: 24px 20px 22px; }
    h1 {
      margin: 0;
      font-size: clamp(28px, 4.5vw, 44px);
      line-height: 1;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      font-weight: 800;
    }
    p {
      margin: 12px 0 0;
      color: var(--text2);
      font-size: 15px;
      line-height: 1.45;
    }
    .actions {
      margin-top: 22px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      min-height: 40px;
      padding: 0 16px;
      border-radius: 9px;
      border: 1px solid var(--border2);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: 0.15s ease;
    }
    .btn-home {
      color: #fff;
      background: linear-gradient(180deg, #ff3f58, #e8253c);
      border: none;
      box-shadow: 0 10px 24px rgba(232, 37, 60, 0.28);
    }
    .btn-home:hover { filter: brightness(1.05); }
    .btn-back {
      color: var(--text2);
      background: var(--s2);
      border-color: var(--border);
      cursor: pointer;
    }
    .btn-back:hover {
      color: var(--text);
      border-color: var(--border2);
    }
    .meta {
      margin-top: 14px;
      color: var(--text3);
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="head">
      <div class="brand"><span class="tri"></span>VAL TRACK</div>
      <div class="code">HTTP <?php echo $status; ?></div>
    </div>
    <div class="body">
      <h1><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></h1>
      <p><?php echo htmlspecialchars($message, ENT_QUOTES, 'UTF-8'); ?></p>
      <div class="actions">
        <a class="btn btn-home" href="<?php echo htmlspecialchars($homePath, ENT_QUOTES, 'UTF-8'); ?>">Back To Home</a>
        <button class="btn btn-back" type="button" onclick="window.history.back()">Go Back</button>
      </div>
      <div class="meta">Requested URL: <?php echo htmlspecialchars($requestUri, ENT_QUOTES, 'UTF-8'); ?></div>
    </div>
  </main>
</body>
</html>
