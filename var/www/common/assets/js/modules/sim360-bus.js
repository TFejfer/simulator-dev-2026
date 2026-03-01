/* /var/www/common/assets/js/modules/sim360-bus.js
 *
 * Small global event bus for the 360 rotator.
 * Keeps the page and rotator decoupled.
 *
 * Exposes:
 *   window.Sim360Bus = {
 *     setFrame(number),
 *     getFrame(): number,
 *     onFrame(fn): unsubscribeFn,
 *     emit(name, payload),
 *     on(name, fn): unsubscribeFn,
 *     setHotspotsVisible(bool),
 *     getHotspotsVisible(): bool
 *   }
 */

(() => {
	'use strict';

	if (window.Sim360Bus) return; // prevent double-load

	let frame = 0;
	const frameListeners = new Set();

	const events = new Map(); // eventName -> Set(fn)
	let hotspotsVisible = true;

	const setFrame = (f) => {
		frame = Number(f) || 0;
		for (const fn of frameListeners) {
			try { fn(frame); } catch (e) {}
		}
	};

	const onFrame = (fn) => {
		frameListeners.add(fn);
		return () => frameListeners.delete(fn);
	};

	const getFrame = () => frame;

	const emit = (name, payload) => {
		const set = events.get(name);
		if (!set) return;
		for (const fn of set) {
			try { fn(payload); } catch (e) {}
		}
	};

	const on = (name, fn) => {
		if (!events.has(name)) events.set(name, new Set());
		events.get(name).add(fn);
		return () => events.get(name)?.delete(fn);
	};

	const setHotspotsVisible = (v) => {
		const next = !!v;
		if (hotspotsVisible === next) return;
		hotspotsVisible = next;
		emit('hotspots:visible', { visible: hotspotsVisible });
	};

	const getHotspotsVisible = () => hotspotsVisible;

	window.Sim360Bus = {
		setFrame,
		onFrame,
		getFrame,
		emit,
		on,
		setHotspotsVisible,
		getHotspotsVisible
	};
})();