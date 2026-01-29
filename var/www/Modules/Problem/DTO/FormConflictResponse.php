<?php
declare(strict_types=1);

namespace Modules\Problem\DTO;

final class FormConflictResponse
{
    /**
     * @param array<string,mixed> $data
     */
    public function __construct(
        public string $formKey,
        public int $currentVersion,
        public array $data,
    ) {}
}