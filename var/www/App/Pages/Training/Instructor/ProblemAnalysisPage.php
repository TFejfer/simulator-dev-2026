<?php
declare(strict_types=1);

namespace App\Pages\Training\Instructor;

use App\Pages\BasePage;

final class ProblemAnalysisPage extends BasePage
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
					'home_html' => '<i class="fa-regular fa-house"></i>',
					'show_logout' => false,
				],
			],
			'chrome' => [
				'sidebar' => true,
				'menubar' => true,
			],
			'overlays' => [
				'toast_container' => true,
				'modal_common' => true,
				// Enable later when used:
				// 'modal_act' => true,
				// 'modal_attachment_insert' => true,
				// 'modal_attachment_view' => true,
			],
		];
	}

	private function readDeliveryMetaFromSession(): array
	{
		$value = $_SESSION['delivery_meta'] ?? null;
		return is_array($value) ? $value : [];
	}
}