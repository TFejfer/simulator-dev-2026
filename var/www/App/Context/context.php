<?php
declare(strict_types=1);

namespace App\Context;

/**
 * Context helpers for pages.
 * Keep this file pure (no output, no DB side effects).
 */

function normalize_context(array $ctx): array
{
    return [
        'site'     => $ctx['site']     ?? null,
        'pace'     => $ctx['pace']     ?? null,
        'skill'    => $ctx['skill']    ?? null,
        'template' => $ctx['template'] ?? null,
        'page'     => $ctx['page']     ?? null,
        'specific' => $ctx['specific'] ?? null,
    ];
}

function ctx_key(array $ctx): string
{
    // Example: training-instructor-setup
    $parts = [];
    if (!empty($ctx['site'])) $parts[] = (string)$ctx['site'];
    if (!empty($ctx['pace'])) $parts[] = (string)$ctx['pace'];
    if (!empty($ctx['skill'])) $parts[] = (string)$ctx['skill'];
    if (!empty($ctx['page'])) $parts[] = (string)$ctx['page'];
    if (!empty($ctx['specific'])) $parts[] = (string)$ctx['specific'];

    return implode('-', $parts);
}