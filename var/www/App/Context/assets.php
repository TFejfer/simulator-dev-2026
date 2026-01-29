<?php
declare(strict_types=1);

namespace App\Context;

/**
 * Resolve JS/CSS assets for a given page context.
 * Returns structure used by header/footer: libs + modules + js.
 *
 * Policy:
 * - All TRAINING pages run polling.
 * - Broadcast is a default feature on all TRAINING pages.
 * - Large legacy bundles (instructor-paced.js) are NOT auto-loaded.
 */
function resolve_assets(array $ctx): array
{
	$libs = [
		'jquery'      => true,
		'fontawesome' => true,
	];

	/**
	 * Core runtime modules.
	 * These control which bundled scripts the footer loads.
	 */
	$modules = [
		'simulator'         => true,
		'simulator-polling' => false,
		'instructor-paced'  => false, // legacy – load only if explicitly needed
	];

	/**
	 * Page-level JS files (feature-based, not bundles).
	 * These are appended verbatim in the footer.
	 */
	$js = [];

	// -------------------------------------------------
	// TRAINING site policy
	// -------------------------------------------------
	if (($ctx['site'] ?? null) === 'training') {

		// Always enable polling runtime
		$modules['simulator-polling'] = true;

		// Default features for ALL training pages
		$js[] = '/common/assets/js/features/broadcast/broadcast.js';
		$js[] = '/common/assets/js/features/auth/access-unblock.js';
	}

	// -------------------------------------------------
	// Pace-specific (ONLY if still required)
	// -------------------------------------------------
	if (($ctx['pace'] ?? null) === 'instructor') {
		// Keep false by default.
		// Only enable if a page explicitly needs legacy instructor-paced.js
		$modules['instructor-paced'] = true;
	}

	if (($ctx['skill'] ?? null) === 'problem') {
		// Keep false by default.
		// Only enable if a page explicitly needs legacy instructor-paced.js
		$modules['problem-forms'] = true;
	}

	return [
		'libs'    => $libs,
		'modules' => $modules,
		'js'      => $js,
	];
}