/**
 * Tiny classname concatenator. Filters falsy values so conditional
 * classes don't print "undefined" into the DOM.
 *
 * Usage:
 *   cn('btn', isActive && 'btn-active', disabled && 'opacity-50')
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
