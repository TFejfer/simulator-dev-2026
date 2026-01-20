<?php
declare(strict_types=1);

namespace App\Pages\Training\Instructor;

use App\Pages\BasePage;

/**
 * SetupPage
 *
 * Instructor-paced participant setup page.
 * Uses the simple layout (no menu/sidebar).
 */
final class SetupPage extends BasePage
{
	public function __construct()
	{
		// Delivery metadata is expected to be prepared earlier (session/bootstrap/meta handling)
		$this->deliveryMeta = $this->readDeliveryMetaFromSession();
	}

	protected function layout(): string
	{
		return self::LAYOUT_SIMPLE;
	}

	/**
	 * Declare UI components for this page using slots.
	 */
	protected function slots(): array
	{
		return [
			'top' => [
				'topbar' => [
					'home_html' => '<i class="fa-regular fa-house"></i>',
					'show_logout' => true,
				],
			],
			'overlays' => [
				// Modals (enable only if setup page actually uses them)
				// 'modal_common' => true,
				// 'modal_act' => true,
				// 'modal_attachment_insert' => true,
				// 'modal_attachment_view' => true,
                // 'toast_container' => true,

				// Optional buttons (normally not needed on setup)
				// 'btn_proceed_tooltip' => true,
				// 'btn_proceed' => ['status' => 'enabled', 'location' => 'training-instructor-outline'],
				// 'btn_back' => ['status' => 'enabled'],
			],
		];
	}

	private function readDeliveryMetaFromSession(): array
	{
		$value = $_SESSION['delivery_meta'] ?? null;
		return is_array($value) ? $value : [];
	}
}