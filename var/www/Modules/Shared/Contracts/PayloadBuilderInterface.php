<?php
declare(strict_types=1);

namespace Modules\Shared\Contracts;

/**
 * PayloadBuilderInterface
 *
 * Domain builders return arrays. Engine/Publish will JSON-encode and ETag them.
 */
interface PayloadBuilderInterface
{
    public function build(array $ctx): array;
}