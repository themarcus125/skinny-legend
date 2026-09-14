/**
 * Conditional class joiner. Deliberately **not** a Tailwind *merger*.
 *
 * Order in the `class` attribute decides nothing: the cascade resolves `px-3` against `px-6` by
 * where the two rules sit in the stylesheet, not by which name the element lists first. So a
 * caller cannot override one of this package's utilities simply by appending the opposing one —
 * whichever Tailwind emits later wins, and that is out of the caller's hands. To override, pass an
 * arbitrary value — `px-[…]` with a length in the brackets, which Tailwind emits in its own, later
 * position — or suffix the utility with `!` for `!important`. Each component's escape hatch is the
 * same `className` prop; it appends, it does not merge.
 *
 * (The examples are written without a concrete utility on purpose: the app's Tailwind scanner
 * reads this file, and a literal class name here would emit a rule nothing uses.)
 *
 * Staying dependency-free is what lets `@skinny/ui` be consumed by Next and Vite alike without
 * either app inheriting a merge configuration. The admin keeps its own `cn`
 * (`apps/admin/src/lib/utils.ts`, a configured `cn/config` merger) for its shadcn/base-ui
 * components, which do rely on conflict resolution.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
