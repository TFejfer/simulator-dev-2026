<?php
declare(strict_types=1);

namespace App\Pages\Training\Instructor;

use App\Pages\BasePage;

/**
 * ProblemActionPage
 *
 * Problem action result page (instructor-paced).
 * Workspace layout with topbar only.
 */
final class ProblemActionPage extends BasePage
{
	public function __construct()
	{
		$this->deliveryMeta = $this->readDeliveryMetaFromSession();
	}

	protected function layout(): string
	{
		return self::LAYOUT_WORKSPACE;
	}

	protected function slots(): array
	{
		return [
			'top' => [
				'topbar' => [
					'home_html' => '',
					'show_logout' => false,
				],
			],
			'overlays' => [
				'toast_container' => true,
			],
		];
	}

	private function readDeliveryMetaFromSession(): array
	{
		$value = $_SESSION['delivery_meta'] ?? null;
		return is_array($value) ? $value : [];
	}
}
