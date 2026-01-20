<?php
declare(strict_types=1);

require_once __DIR__ . '/../../App/bootstrap.php';

// Prevent caching (avoid stale login state)
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: Thu, 19 Nov 1981 08:52:00 GMT");

// If already logged in, go to index (which routes correctly)
if (!empty($_SESSION['user_id']) && !empty($_SESSION['delivery_meta']['access_id'])) {
    header('Location: /');
    exit;
}

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $req = new \Modules\Training\Auth\DTO\LoginRequest(
        username: (string)($_POST['username'] ?? ''),
        password: (string)($_POST['password'] ?? ''),
        csrfToken: (string)($_POST['csrf_token'] ?? ''),
        ipAddress: (string)($_SERVER['REMOTE_ADDR'] ?? ''),
        userAgent: (string)($_SERVER['HTTP_USER_AGENT'] ?? ''),
    );

    $result = $participantLoginService->login($req);

    if ($result->ok && $result->redirectUrl) {
		error_log('LOGIN redirectUrl=' . $result->redirectUrl);

        header('Location: ' . $result->redirectUrl);
        exit;
    }

    $errors = $result->errors;
}

$csrfToken = $csrfService->getOrCreate();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Critical Thinking | Training</title>
    <link rel="icon" type="image/png" href="/common/assets/images/favicon.png">
    <link rel="stylesheet" href="/common/assets/css/login.css">
</head>
<body>
<div class="container">
    <div class="login-box">
        <div class="login-form">
            <h1>TRAINING</h1>
            <p>powered by sim4people</p>

            <form method="post" action="">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken); ?>">

                <label for="username">Username</label>
                <input type="text" name="username" required>

                <label for="password">Password</label>
                <input type="password" name="password" required>

                <button type="submit">Log In</button>
            </form>

            <?php if (!empty($errors)): ?>
                <div class="error">
                    <?php foreach ($errors as $error): ?>
                        <p><?php echo htmlspecialchars($error); ?></p>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>

        </div>
    </div>
</div>
</body>
</html>
