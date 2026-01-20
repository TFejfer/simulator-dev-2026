<?php
declare(strict_types=1);

namespace App\Pages\Contracts;

interface PageInterface
{
    public function getPage(): string;

    /** Data til JS (script#page-data) */
    public function getPageData(): array;
}