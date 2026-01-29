<?php
declare(strict_types=1);

namespace Modules\Problem\DTO;

final class FormRequest
{
    public function __construct(
        public int $accessId,
        public int $teamNo,
        public int $outlineId,
        public int $exerciseNo,
        public string $actorToken,
        public string $formKey,
        public string $crud,
        public int $expectedVersion,
        /** @var array<string,mixed> */
        public array $payload = [],
    ) {}
}