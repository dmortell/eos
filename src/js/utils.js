import { bubble, listen } from 'svelte/internal';

export function getEventsAction(component) {
	return (node) => {
		const events = Object.keys(component.$$.callbacks);
		const listeners = [];
		events.forEach((event) => listeners.push(listen(node, event, (e) => bubble(component, e))));
		return {
			destroy: () => {
				listeners.forEach((listener) => listener());
			},
		};
	};
}

function selectOnFocus(node) {		// usage: <input use:selectOnFocus />
	if (node && typeof node.select === 'function' ) {               // make sure node is defined and has a select() method
	  const onFocus = event => node.select()                        // event handler
	  node.addEventListener('focus', onFocus)                       // when node gets focus call onFocus()
	  return {
		destroy: () => node.removeEventListener('focus', onFocus)   // this will be executed when the node is removed from the DOM
	  }
	}
  }
export function getFocusable(context = document) {
	const focusable = Array.prototype.slice
		.call(context.querySelectorAll('button, [href], select, textarea, input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])'))
		.filter(function(item) {
			const style = window.getComputedStyle(item);
			return (
				!item.disabled &&
				!item.getAttribute('disabled') &&
				!item.classList.contains('disabled') &&
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				style.opacity > 0
			);
		});
	return focusable;
}
export function trapTabKey(e, context) {
	if (e.key !== 'Tab' && e.keyCode !== 9) return;
	let focusableItems = getFocusable(context);
	if (focusableItems.length === 0) { e.preventDefault(); return; }
	let focusedItem = document.activeElement;
	let focusedItemIndex = focusableItems.indexOf(focusedItem);
	if (e.shiftKey) {
		if (focusedItemIndex <= 0) {
			focusableItems[focusableItems.length - 1].focus();
			e.preventDefault();
		}
	} else {
		if (focusedItemIndex >= focusableItems.length - 1) {
			focusableItems[0].focus();
			e.preventDefault();
		}
	}
}

export function enableScroll(enable) {
	let isHidden = document.body.style.overflow === 'hidden';
	if (enable && isHidden) {
		let top = Math.abs(parseInt(document.body.style.top));
		document.body.style.cssText = null;
		document.body.removeAttribute('style');
		window.scrollTo(0, top);
	} else if (!enable && !isHidden) {
		let top = Math.max(document.body.scrollTop, (document.documentElement && document.documentElement.scrollTop) || 0)
		document.body.style.top = '-' + top + 'px';
		document.body.style.position = 'fixed';
		document.body.style.width = '100%';
		document.body.style.overflow = 'hidden';
	}
}