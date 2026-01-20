<?php
declare(strict_types=1);

namespace App\Context;

/**
 * Load PHP dependencies for a given context.
 * For now: keep minimal and non-breaking.
 */
function require_context(array $ctx): void
{
    // Placeholder: hook for auth/session gating later
    // Intentionally empty in this step.
}