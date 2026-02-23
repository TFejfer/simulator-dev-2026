<?php
declare(strict_types=1);

namespace App\Pages\Training\Instructor;

use App\Pages\BasePage;

/**
 * ProblemCompletePage
 *
 * Exercise completion page (instructor-paced).
 * Simple layout with topbar only.
 */
final class ProblemCompletePage extends BasePage
{
	public function __construct()
	{
		$this->deliveryMeta = $this->readDeliveryMetaFromSession();
	}

	protected function layout(): string
	{
		return self::LAYOUT_SIMPLE;
	}

	protected function slots(): array
	{
		return [
			'top' => [
				'topbar' => [
					'home_html' => '<i class="fa-regular fa-house"></i>',
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
