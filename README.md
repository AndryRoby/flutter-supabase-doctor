# Flutter Supabase Doctor

A free tool that checks a `supabase_flutter` OAuth / magic-link deep
link configuration and finds the exact reason the redirect never
returns to the app. Live: https://arling.sk/flutter-supabase-doctor/

## What it checks

Given your app's scheme/host, launch mode, flow type, Supabase
project config, OAuth provider, and a few facts about your Dart code,
`doctor-flutter.js` computes the `scheme://host` redirect your app
should produce and cross-checks it against every layer that has to
agree on it:

- `missing_scheme` / `scheme_invalid_chars` / `scheme_invalid_case` /
  `scheme_reserved_http`: the URL scheme is empty, uses invalid
  characters, has uppercase letters or whitespace, or is `http`/`https`
  (which only works via Universal Links / App Links, a separate setup).
- `scheme_underscore`: an underscore in the scheme or host. Google's
  OAuth redirect handling mangles underscores, so a scheme like
  `my_app` *always* fails Supabase's redirect-URL check and silently
  falls back to Site URL.
- `redirect_to_mismatch` / `redirect_to_trailing_slash`: the
  `redirectTo` your Dart code passes doesn't match `scheme://host`
  byte-for-byte.
- `redirect_not_allowlisted`: that value isn't covered by any pattern
  in the Supabase Redirect URLs allow-list, matched with the same glob
  syntax Supabase uses (`*`, `**`, `?`, character classes, `\` escapes).
- `site_url_is_localhost`: Supabase's Site URL still points at
  localhost, which is what a rejected redirect silently falls back to.
- `project_url_unusual` / `missing_project_url`: the Supabase project
  URL doesn't look like `https://<ref>.supabase.co`, or is empty.
- `ios_scheme_missing_in_plist`: `Info.plist`'s `CFBundleURLSchemes`
  doesn't list the scheme, so iOS never hands the redirect back.
- `android_intent_filter_missing` / `android_intent_filter_mismatch`:   the `AndroidManifest.xml` intent-filter is absent, or its
  `android:scheme` / `android:host` don't match.
- `android_autoverify_no_effect`: `android:autoVerify="true"` on a
  custom-scheme intent-filter, which does nothing there (it's an
  Android App Links / https-only feature).
- `launch_mode_in_app_webview` / `launch_mode_not_set`:   `authScreenLaunchMode` is `LaunchMode.inAppWebView`, which several
  providers (Kakao, Discord, Facebook) hang inside of because they
  detect the embedded WebView; or it isn't set at all.
- `auth_flow_type_implicit` / `auth_flow_type_not_set`: implicit flow
  instead of the recommended PKCE, or the flow type isn't stated.
- `provider_redirect_uri_missing` / `provider_uri_points_to_app_scheme`
 : the OAuth provider console doesn't have Supabase's exact
  `https://<ref>.supabase.co/auth/v1/callback`, including the specific
  case where the app's own scheme was pasted there instead.
- `skip_browser_redirect_manual`: you're launching the OAuth URL
  yourself instead of letting `signInWithOAuth()` do it, so you now own
  presenting it and routing the redirect back.
- `auth_state_listener_missing`: no `onAuthStateChange` listener, so
  sign-in can complete while the UI still shows a logged-out screen.

Each problem carries a severity (`high`/`medium`/`low`), the exact
field it came from, and a copy-paste fix where one applies.

## What it does not do

It's a config linter, not a live tester. It never calls your app,
your Supabase project, or any OAuth provider: it only compares the
values you type against each other. It doesn't verify anything against
your actual `Info.plist`, `AndroidManifest.xml`, live Supabase project,
or provider console: it checks what you entered, not what's deployed.
There is no account, no login, and nothing you type is sent anywhere.

## How it works

The page runs one pure function, `diagnose(config)`, from
`doctor-flutter.js` entirely in your browser: no network request
carries your configuration anywhere. Loaded as `<script type="module">`
it also publishes `window.RedirectDoctorFlutter = { diagnose,
expectedValues }` for console use.

```js
import { diagnose } from './doctor-flutter.js';

diagnose({
  app: {
    scheme: "my_app",
    host: "login-callback",
    launchMode: "externalApplication",
    authFlowType: "pkce",
    iosSchemesInPlist: ["my_app"],
    androidIntentFilter: { scheme: "my_app", host: "login-callback", autoVerify: false }
  },
  supabase: {
    projectUrl: "https://abcd1234.supabase.co",
    siteUrl: "https://myapp.com",
    allowedRedirectUrls: ["my_app://**"]
  },
  provider: {
    name: "google",
    authorizedRedirectUris: ["https://abcd1234.supabase.co/auth/v1/callback"]
  },
  code: {
    redirectTo: "my_app://login-callback",
    usesSkipBrowserRedirect: false,
    listensToAuthStateChange: true
  }
});
```

Output (run through Node against the current `doctor-flutter.js`):

```json
{
  "status": "fail",
  "summary": "1 blocking mismatch found. Most urgent: \"my_app\" contains an underscore. Google's OAuth redirect handling mangles underscores in redirect URLs: a scheme or host like \"my_app\" *always* fails Supabase's redirect-URL check and silently falls back to Site URL (tracked in supabase/auth#2447). Use a hyphen instead.",
  "problems": [
    {
      "severity": "high",
      "code": "scheme_underscore",
      "message": "\"my_app\" contains an underscore. Google's OAuth redirect handling mangles underscores in redirect URLs: a scheme or host like \"my_app\" *always* fails Supabase's redirect-URL check and silently falls back to Site URL (tracked in supabase/auth#2447). Use a hyphen instead.",
      "where": "app.scheme"
    }
  ],
  "fixes": [
    { "title": "Replace underscores with hyphens", "value": "my-app", "where": "app.scheme" }
  ]
}
```

Every other layer in that input agrees with every other one: a
manual review would likely wave it through: but the scheme itself is
still silently broken end to end, which is why the check runs on
scheme validity by itself rather than only comparing layers.

## Run locally

No build step; it's static files.

```bash
python -m http.server
# or just open index.html directly in a browser
```

Tests: `node tests.mjs`: 94 assertions, all passing as of this
README.

## Privacy

Everything runs in your browser; no server ever sees your
configuration. Anonymous usage analytics (page views, "run check"
clicked) go to a self-hosted Umami instance with no cookies and no
personal data collected. The optional "notify me about new tools"
email list is opt-in only. Full policy:
https://arling.sk/privacy/

## Sources

The rules this tool encodes come from:

- [Native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking): redirect URL format, `CFBundleURLSchemes`, the Android intent-filter shape.
- [`signInWithOAuth` reference (Dart)](https://supabase.com/docs/reference/dart/auth-signinwithoauth): `authScreenLaunchMode`, `redirectTo`, `scopes`, `queryParams`.
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls): the allow-list glob syntax (`*`, `**`, `?`, character classes).
- [`supabase_flutter` on pub.dev](https://pub.dev/packages/supabase_flutter): deep link requirements for magic link, email confirmation, password reset, and OAuth.
- [supabase/auth#2447](https://github.com/supabase/auth/issues/2447): underscores in a redirect URL being mangled by Google's OAuth handling and silently falling back to Site URL.

## Report a problem

Found a `supabase_flutter` deep-link failure this tool misses, or a
check that flags something that's actually fine? Open an issue:
https://github.com/AndryRoby/flutter-supabase-doctor/issues, or write
to andrej@arling.sk. Redact project refs, client secrets, and real
bundle IDs before posting: issues are public.

## License

All rights reserved, see [LICENSE-NOTICE.md](LICENSE-NOTICE.md).
Reading the code and learning from it is fine; deploying your own copy
of it isn't.

---

ARLing s. r. o., Bratislava, Slovakia. https://arling.sk/

Free tools from the same hub:
- https://arling.sk/google-oauth-redirect-doctor/
- https://arling.sk/expo-supabase-auth-doctor/
- https://arling.sk/supabase-redirect-doctor/
- https://arling.sk/flutter-supabase-doctor/ (this one)
- https://arling.sk/expo-universal-links-doctor/
- https://arling.sk/sepa-pain001-doctor/
- https://arling.sk/bookapp/
