<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;

final class FormTemplateRepository
{
	public function __construct(private PDO $dbSharedContent) {}

	public function templateCodeById(int $templateId): string
	{
		if ($templateId <= 0) return 'default';

		$stmt = $this->dbSharedContent->prepare("
			SELECT template_code
			FROM meta_form_templates
			WHERE id = :id
			LIMIT 1
		");
		$stmt->execute([':id' => $templateId]);

		$code = (string)($stmt->fetchColumn() ?: '');
		return $code !== '' ? $code : 'default';
	}

	public function defaultTemplateId(): int
	{
		$stmt = $this->dbSharedContent->prepare("
			SELECT id
			FROM meta_form_templates
			WHERE template_code = 'default'
			LIMIT 1
		");
		$stmt->execute();
		return (int)($stmt->fetchColumn() ?: 0);
	}
}