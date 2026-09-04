# Flutter Supabase Doctor — deep links for supabase_flutter

Live: https://arling.sk/flutter-supabase-doctor/

A free, static, client-side tool that checks your **supabase_flutter**
OAuth / magic-link **deep link** configuration — iOS `Info.plist`,
`AndroidManifest.xml` intent-filter, `signInWithOAuth()` call, the
Supabase Redirect URLs allow-list, and the OAuth provider's own
console — and points at the exact mismatch stopping the redirect from
returning to your app, instead of you re-reading the Supabase native
deep-linking docs for the third time.

## What it's for

If sign-in works in your Supabase dashboard but the browser or
provider's login screen never hands control back to your Flutter app
— it hangs on the provider's page, Safari says it can't open the
page, or the app opens but silently stays signed out — this tool
takes the config that's normally scattered across two native files, a
few lines of Dart, and two or three separate dashboards, and
cross-checks it for the mismatches that cause almost all of these
failures:

- A custom **URL scheme** that's empty, reserved (`http`/`https`),
  contains **uppercase letters or an underscore** — Google's OAuth
  redirect handling mangles underscores and *always* fails Supabase's
  redirect-URL check, silently falling back to Site URL
  ([supabase/auth#2447](https://github.com/supabase/auth/issues/2447))
  — or otherwise isn't a valid `scheme://host` per
  [Supabase's native deep-linking guide](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).
- **`redirectTo` in your Dart code** not matching `scheme://host`
  byte-for-byte (a stray trailing slash is enough).
- The **Supabase Redirect URLs allow-list** not covering that exact
  value — matched the same way Supabase matches it (`*`, `**`, `?`,
  character classes).
- **iOS `Info.plist`** — `CFBundleURLSchemes` missing the scheme, so
  iOS has nothing to hand the redirect back to.
- **`AndroidManifest.xml`** — an intent-filter that's missing
  entirely, or whose `android:scheme` / `android:host` don't match,
  so Android drops the user back in the browser; also flags
  `android:autoVerify="true"` on a custom-scheme filter, which does
  nothing there (it's an Android App Links / https-only feature).
- **`authScreenLaunchMode`** — `LaunchMode.inAppWebView` makes several
  providers (Kakao, Discord, Facebook) hang because they detect an
  embedded WebView and never hand control back to the OS to fire the
  redirect.
- **`authFlowType`** — recommends PKCE over implicit for native apps.
- The **OAuth provider's own console** (Google Cloud Console, Apple
  Services ID, GitHub OAuth App, Discord, Kakao) needing Supabase's
  own `https://<ref>.supabase.co/auth/v1/callback` — not your app's
  scheme — and flags the specific case where your app's scheme was
  pasted there by mistake.
- Missing an **`onAuthStateChange` listener**, which is why sign-in
  can "complete" while the UI still shows a logged-out screen.

## How it works (client-side only)

Everything runs in your browser. There is no backend, no account, and
no payment wall. You fill in your configuration (scheme, host,
launch mode, flow type, Supabase project/Site URL/allow-list, provider
name and redirect URIs, and a few flags about your Dart code) into the
page, and `doctor-flutter.js` — one dependency-free JavaScript file —
runs a single pure function, `diagnose(config)`, entirely in your
browser, and you get a plain-language report of what's wrong, with
copy-paste fixes for `Info.plist`, `AndroidManifest.xml`, and your
`signInWithOAuth()` call.

Nothing about your configuration is sent anywhere. The only network
activity this site generates is:

- loading its own static assets (HTML/CSS/JS) from GitHub Pages,
- and anonymous product-analytics events (page view, "run check"
  clicked, etc.) sent to a self-hosted Umami instance — **event names
  and counts only, never the content of what you entered.**

You can verify this yourself: open your browser's network tab while
using the tool, or just read `index.html` and `doctor-flutter.js` —
it's static files with no build step.

## Privacy

- No account, no login, no cookies for the tool itself.
- No server-side processing of your config — the "backend" is your
  own browser's JavaScript engine.
- Analytics (Umami) records that *a* check ran, not *what* you
  checked.
- If you're paranoid (fair, given the subject matter), download the
  repo and open `index.html` locally with your network disconnected —
  it still works.

## Running it locally

There's no build step. It's static files.

```bash
git clone https://github.com/AndryRoby/flutter-supabase-doctor.git
cd flutter-supabase-doctor
# any static file server works, e.g.:
npx serve .
# or just open index.html directly in a browser
```

## Reporting a missing case / false positive

Found a supabase_flutter deep-link failure mode this tool doesn't
catch, or a check that flags something that's actually fine? Please
open an issue on the GitHub repo with:

1. The relevant (redacted) config — scheme/host, launch mode, flow
   type, the Supabase allow-list entries, the provider.
2. What actually went wrong at runtime (error text, screenshot, or
   behavior description).
3. What you expected the tool to say.

Redact anything sensitive (project refs, client secrets, real bundle
IDs) before posting — issues are public.

## Disclaimer

This tool is provided **as is**, with no warranty of any kind. It
checks for known, common misconfiguration patterns — it cannot
guarantee your OAuth or magic-link flow will work, and a clean report
is not a guarantee of a working integration. It performs a read-only,
client-side analysis of the values you type in; nothing is verified
against your live Supabase project, `Info.plist`, `AndroidManifest.xml`,
or provider console. Supabase, Flutter, Google, Apple, GitHub,
Discord, and Kakao are not affiliated with this tool, and their SDKs,
consoles, and docs may change in ways that make individual checks
stale over time. Always verify against the current official
documentation for anything security-relevant.

## About

Built by ARLing s. r. o. (Bratislava, Slovakia).
Contact: andrej@arling.sk

Sibling tools in the same "Redirect Doctor" family:
- Web (Next.js / Vite / SvelteKit): https://arling.sk/supabase-redirect-doctor/
- Expo / React Native: https://arling.sk/expo-supabase-auth-doctor/
