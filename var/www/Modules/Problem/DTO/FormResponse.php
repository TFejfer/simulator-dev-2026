<?php
declare(strict_types=1);

namespace Modules\Problem\DTO;

final class FormResponse
{
    /**
     * @param array<string,mixed> $data
     */
    public function __construct(
        public bool $ok,
        public string $formKey,
        public int $version,
        public array $data = [],
    ) {}
}