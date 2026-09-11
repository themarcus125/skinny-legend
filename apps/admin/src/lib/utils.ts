import { createCn } from 'cn/config';

/**
 * The stock `cn` only knows Tailwind's built-in font sizes, so it reads the custom
 * `text-label` utility (13px, declared in globals.css) as a text *colour* and lets it
 * clobber `text-muted-foreground` & co. Teach the merger the extra size so every ui/*
 * component resolves conflicts correctly.
 */
export const cn = createCn({
  extend: { classGroups: { 'font-size': [{ text: ['label'] }] } },
});
