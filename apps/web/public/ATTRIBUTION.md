# Bundled media attribution

- `signin-bg.mp4` — "Group Exercise Session on a Sunny Day" by Franco Garcia, Pexels video 38676016
  (https://www.pexels.com/video/group-exercise-session-on-a-sunny-day-38676016/).
  Pexels licence: free to use, no attribution required, modification allowed, use in apps permitted.
  Transcoded 2026-09-12 to 1080×1920 H.264, 8.6 s, no audio.
  Copied verbatim from `ios/SkinnyLegend/Resources/signin-bg.mp4` so both clients show the same
  sign-in background. Deliberately outside the service worker's precache (`globPatterns` in
  `vite.config.ts` lists no `mp4`): 4.1 MB has no business in an install-time precache for a
  screen most members see once.

- Be Vietnam Pro (SIL Open Font License 1.1) is not served from here — `@skinny/ui` self-hosts it
  (`packages/ui/src/styles/fonts.css`) and carries its own licence note.
