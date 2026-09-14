# Firebase — Auth, Admin SDK credentials and FCM (SKI-40)

One Firebase project serves all three clients: the iOS app (Apple + Google sign-in, push), the
admin dashboard (Google sign-in), and the API (token verification + FCM sends via the Admin
SDK).

> Steps marked **[needs SKI-42]** depend on a paid Apple Developer account and cannot be
> completed before it exists.

## 1. Create the project

1. console.firebase.google.com → **Add project** → name it (e.g. `skinny-legend`).
2. Google Analytics: not needed; turn it off.
3. Note the **Project ID** Firebase assigns (e.g. `skinny-legend-4f2a1`). It is not a secret and
   it must be the *same* value everywhere: `FIREBASE_PROJECT_ID` on Railway and
   `NEXT_PUBLIC_FIREBASE_PROJECT_ID` on Vercel. A mismatch makes every API call 401, because the
   API verifies the token's audience against its own project.

## 2. Register the apps

### iOS app

**Project settings → Your apps → Add app → iOS**.

- Bundle ID: **`com.themarcus125.skinnylegend`** (from `ios/project.yml`,
  `PRODUCT_BUNDLE_IDENTIFIER`). It must match exactly.
- App Store ID / team ID: optional now, fill later **[needs SKI-42]**.
- Download **`GoogleService-Info.plist`** and put it at
  **`ios/SkinnyLegend/GoogleService-Info.plist`**. It is gitignored (`.gitignore` line
  `ios/SkinnyLegend/GoogleService-Info.plist`) and is never committed — every machine and CI
  runner supplies its own copy. Without it the app falls back to mock services
  (`AppMode.servicesAreLive`).
- Open the plist, copy the **`REVERSED_CLIENT_ID`** value
  (`com.googleusercontent.apps.<digits-hash>`) and paste it into `ios/project.yml` as
  `GOOGLE_REVERSED_CLIENT_ID`, replacing the placeholder
  `com.googleusercontent.apps.unconfigured`; then regenerate the Xcode project with XcodeGen.
  It becomes the app's URL scheme — Google Sign-In cannot call back into the app without it.

### Web app (admin dashboard)

**Project settings → Your apps → Add app → Web** (no Firebase Hosting).

Firebase prints a config object. Four of its fields are the admin's environment variables
(`apps/admin/src/lib/auth/firebase.ts` reads exactly these four and nothing else):

| Firebase config field | Vercel variable |
| --- | --- |
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` (e.g. `skinny-legend.firebaseapp.com`) | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

`messagingSenderId` / `storageBucket` are not used by the admin — skip them. None of these four
is a secret: Next.js inlines every `NEXT_PUBLIC_*` value into the client bundle, and Firebase
Web config is public by design. Access is enforced by the API's token verification plus the
`role=admin` + `status=active` check.

## 3. Sign-in providers

**Authentication → Get started → Sign-in method.**

### Google (needed by both the app and the dashboard)

Enable **Google**, set a project support email, save. Nothing else is required — the OAuth
client is created for you, and the iOS side of it is what produced `REVERSED_CLIENT_ID`.

### Apple **[needs SKI-42]**

Enable **Apple**. For the *iOS app alone*, "Sign in with Apple" works with just the provider
enabled and the `Sign In with Apple` capability on the App ID. The extra fields exist for the
web/OAuth flow, and Firebase asks for them from the Apple Developer account:

| Firebase field | Where it comes from in the Apple Developer account |
| --- | --- |
| Services ID | Certificates, IDs & Profiles → Identifiers → **Services IDs** → new ID (e.g. `com.themarcus125.skinnylegend.web`), enable *Sign in with Apple*, configure it with the Firebase **OAuth redirect URI** shown on the same Firebase screen (`https://<project-id>.firebaseapp.com/__/auth/handler`) |
| Apple Team ID | Membership page (10 characters) |
| Key ID + private key (`.p8`) | Keys → new key with **Sign in with Apple** enabled; download the `.p8` **once** and paste its contents into Firebase |

Also on the App ID `com.themarcus125.skinnylegend`: enable the **Sign In with Apple** and **Push
Notifications** capabilities.

## 4. Service account for the API (Admin SDK)

**Project settings → Service accounts → Firebase Admin SDK → Generate new private key.** A JSON
file downloads; treat it as a credential (do not commit it, do not paste it into chat).

Map three of its fields onto Railway variables (`apps/api/src/services/firebase.ts`):

| JSON field | Railway variable |
| --- | --- |
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` (`firebase-adminsdk-…@<project>.iam.gserviceaccount.com`) | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

### The private key and `\n`

In the JSON the key is a single line whose newlines are already the two characters `\` + `n`:

```
"-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

Paste it into Railway **exactly like that** — one line, literal `\n`, no surrounding quotes, no
real line breaks. The API unescapes it at boot:

```ts
privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
```

If you paste a multi-line PEM instead, Railway's bulk-paste editor splits it across variables
and the boot fails; if you paste with the JSON quotes still attached, `cert()` rejects the key.

Set the same three variables on the `notify` cron service — it uses the same credential to send
through FCM.

## 5. Push / Cloud Messaging **[needs SKI-42]**

**Project settings → Cloud Messaging → Apple app configuration → APNs Authentication Key →
Upload.**

- Create the key in the Apple Developer account: Certificates, IDs & Profiles → **Keys** → new
  key with **Apple Push Notifications service (APNs)** enabled → download the `.p8` (once).
- Upload it to Firebase with its **Key ID** and your **Team ID**.

One APNs auth key covers sandbox and production, but the app's `aps-environment` entitlement
must match the build: `ios/SkinnyLegend/SkinnyLegend.entitlements` ships `development`, and a
TestFlight/App Store export must carry `production` or the minted tokens are sandbox tokens and
every send fails.

Until the key is uploaded, the `notify` cron runs, plans reminders and writes
`notification_log` rows, but FCM rejects the sends.

## 6. Authorized domains for the dashboard

**Authentication → Settings → Authorized domains.** `localhost` is there by default. Add:

- the Vercel production domain (e.g. `skinny-legend-admin.vercel.app`),
- any preview domain you actually sign in from — Firebase does not accept wildcards, so add the
  specific `…-<hash>.vercel.app` hosts you use, or sign in only on production,
- any custom domain you attach later.

A domain that is missing here fails the Google popup with `auth/unauthorized-domain`.

## 7. Verify

1. Admin dashboard with `NEXT_PUBLIC_MOCK=0` → Google sign-in completes and you land on
   `/not-authorized` (expected until the SQL promotion in `docs/deploy/railway.md`).
2. After promoting: the dashboard loads members and entries.
3. iOS app with the plist in place and mock mode off → Apple/Google sign-in returns a token the
   API accepts, and a `users` row appears.
4. Push: confirm one entry, accept the permission prompt, check a `device_tokens` row exists,
   then let the `notify` cron run (or run `node dist/jobs/notify.js` against production).

## Values to hand back

Non-secret: **project id**, the four `NEXT_PUBLIC_FIREBASE_*` values, the bundle id, the
`REVERSED_CLIENT_ID`. Secret (Railway Variables only, never chat): the service-account JSON, the
APNs `.p8`, the Sign in with Apple `.p8`.
