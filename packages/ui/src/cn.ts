/**
 * Conditional class joiner. Deliberately not a Tailwind *merger*: every component in this package
 * puts its own classes first and the caller's `className` last, so the later class already wins on
 * equal specificity. Keeping this dependency-free is what lets `@skinny/ui` be consumed by Next
 * and Vite alike without either app inheriting a merge configuration.
 *
 * The admin keeps its own `cn` (`apps/admin/src/lib/utils.ts`, a configured `cn/config` merger)
 * for its shadcn/base-ui components, which do rely on conflict resolution.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
