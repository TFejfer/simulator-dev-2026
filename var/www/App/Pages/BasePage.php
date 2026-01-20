<?php
declare(strict_types=1);

namespace App\Pages;

use App\Pages\Contracts\PageInterface;

/**
 * BasePage
 *
 * Shared base class for all page controllers.
 *
 * Provides:
 * - Standard page skeletons (simple / workspace)
 * - Slot-based component rendering (page decides WHAT, BasePage decides WHERE)
 * - Default page-data contract including PAGE context for JavaScript
 *
 * Design:
 * - Pages declare UI by overriding slots().
 * - BasePage renders slots in fixed places for each layout.
 * - Components are rendered from /var/www/App/View/Components/<name>.php
 *
 * Slot names used by BasePage:
 * - top: typically topbar
 * - chrome: sidebar/menubar (workspace pages)
 * - overlays: modals/toasts/tooltips (usually appended once)
 */
abstract class BasePage implements PageInterface
{
	/** Layout without menu/sidebar (e.g. setup, login, waiting room) */
	public const LAYOUT_SIMPLE = 'simple';

	/** Layout with menu/sidebar/workspace */
	public const LAYOUT_WORKSPACE = 'workspace';

	/** Delivery/session metadata available to the page */
	protected array $deliveryMeta = [];

	/**
	 * Each concrete page must choose its layout type.
	 */
	abstract protected function layout(): string;

	/**
	 * Accessor for delivery metadata.
	 */
	public function getDeliveryMeta(): array
	{
		return $this->deliveryMeta;
	}

	/**
	 * Returns the full page HTML skeleton.
	 * Concrete pages do NOT build layout HTML themselves.
	 */
	public function getPage(): string
	{
		return match ($this->layout()) {
			self::LAYOUT_WORKSPACE => $this->workspaceSkeleton(),
			default => $this->simpleSkeleton(),
		};
	}

	/**
	 * Returns a stable page key for JavaScript (preferred over parsing URL paths).
	 *
	 * Expected source:
	 * - Set by page entrypoint: $_SERVER['APP_PAGE_KEY'] = $ctxKey
	 *
	 * Fallback:
	 * - Empty string if not provided (keeps contract stable).
	 */
	protected function getPageKey(): string
	{
		$key = (string)($_SERVER['APP_PAGE_KEY'] ?? '');
		return trim($key);
	}

	/**
	 * Slot declaration for this page.
	 *
	 * Format:
	 * return [
	 *	'top' => [
	 *		'topbar' => [ ... vm ... ],
	 *	],
	 *	'chrome' => [
	 *		'sidebar' => true,
	 *		'menubar' => true,
	 *	],
	 *	'overlays' => [
	 *		'toast_container' => true,
	 *		'modal_common' => true,
	 *	],
	 * ];
	 *
	 * - value true  => render component with default vm (empty array)
	 * - value array => render component with provided vm
	 */
	protected function slots(): array
	{
		return [];
	}

	/**
	 * Render a single component partial.
	 */
	protected function renderComponent(string $name, array $vm = []): string
	{
		$path = '/var/www/App/View/Components/' . $name . '.php';
		if (!is_file($path)) {
			return '';
		}

		ob_start();
		include $path;
		return (string)ob_get_clean();
	}

	/**
	 * Render a named slot.
	 * Pages fully control which components are included in each slot.
	 */
	protected function renderSlot(string $slotName): string
	{
		$slots = $this->slots();
		$decl = $slots[$slotName] ?? null;

		if (!is_array($decl) || $decl === []) {
			return '';
		}

		$out = '';

		foreach ($decl as $name => $cfg) {
			if ($cfg === true) {
				$out .= $this->renderComponent((string)$name, []);
				continue;
			}

			if (is_array($cfg)) {
				$out .= $this->renderComponent((string)$name, $cfg);
				continue;
			}
		}

		return $out;
	}

	/**
	 * Skeleton for pages without menu/sidebar.
	 * Slots:
	 * - top
	 * - overlays
	 */
	protected function simpleSkeleton(): string
	{
		return '
			' . $this->renderSlot('top') . '
			' . $this->renderSlot('overlays') . '

			<div id="main-no-menu">
				<div class="main-content-outer">
					<div id="display_content"></div>
				</div>
			</div>
		';
	}

	/**
	 * Skeleton for workspace pages with menu/sidebar.
	 * Slots:
	 * - top
	 * - chrome
	 * - overlays
	 */
	protected function workspaceSkeleton(): string
	{
		return '
			' . $this->renderSlot('top') . '
			' . $this->renderSlot('chrome') . '
			' . $this->renderSlot('overlays') . '
			<div id="main"></div>
		';
	}

	/**
	 * Default page-data payload exposed to JavaScript.
	 * Pages may override and extend this.
	 */
	public function getPageData(): array
	{
		return [
			'PAGE' => [
				'key' => $this->getPageKey(),
				'layout' => $this->layout(),
			],
			'DELIVERY' => $this->getDeliveryMeta(),
		];
	}
}