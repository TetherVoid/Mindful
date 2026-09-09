# Google and Apple sign-in

The application side is done: `AuthContext` exposes `signInWithGoogle()`,
`signInWithApple()` and the general `signInWithOAuth(provider)`, and the
Supabase client is configured for the flow they need. What remains is dashboard
and provider configuration, which cannot be done from this repository.

Until a provider is both enabled in Supabase **and** listed in
`VITE_OAUTH_PROVIDERS`, `useAuth().oauthProviders` is empty and the sign-in page
has nothing to render. That is deliberate — a button that fails on click is
worse than no button.

## How the flow works here

`src/backend/database/client.js` sets three auth options explicitly rather than
leaving them to the library's defaults, because two of them are security
decisions:

- **`flowType: 'pkce'`** — the authorization-code flow with a proof key. The
  alternative, `implicit`, returns the access token in the URL fragment, where
  it lands in browser history and in any `Referer` a third-party asset triggers.
  PKCE returns a single-use code instead, and that code is worthless without the
  verifier held in the tab that started the exchange.
- **`detectSessionInUrl: true`** — what actually exchanges the returned code for
  a session, and then strips it from the address bar.
- **`autoRefreshToken: true`** — access tokens are short-lived on purpose;
  without this a long session starts silently failing RLS checks instead of
  staying signed in.

PKCE is **not** the supabase-js default — the library still defaults to
`implicit` — so this is a deliberate change, and it has one cost. The code
verifier lives in the localStorage of the browser that started the flow, so an
email confirmation or password-reset link opened in a *different* browser than
the one that requested it cannot complete: sign up on a laptop, confirm from a
phone, and the link fails. That is the accepted trade for keeping access tokens
out of URLs, history and `Referer` headers. If cross-device confirmation turns
out to matter more for this audience, the way back is the one line in
`client.js`, not a workaround somewhere else.

### The callback needs no route

The redirect target defaults to the site origin, `/`. When the browser comes
back with `?code=…`, supabase-js exchanges it during its own boot, and
`AuthContext` reads the result: `getSession()` resolves *after* that exchange, so
there is no moment in which a user returning from Google looks signed out and
gets bounced to `/login`. `RootRedirect` then sends them to `/dashboard`.

If a dedicated `/auth/callback` page is wanted later, set
`VITE_AUTH_REDIRECT_URL` to it, add the URL to the Supabase allow-list, and add
the route. Nothing in the backend needs to change — but note that today
`App.jsx` sends unknown paths to `/`, so pointing the redirect at a route that
does not exist yet would work by accident rather than by design. Add the route
first.

### When the provider says no

A refusal comes back as `?error=access_denied&error_description=…`, not as a
failed request. `AuthContext` reads it once per page load, exposes it as
`authError`, and clears it from the address bar so a refresh does not resurrect
it and the text does not travel on in a `Referer`. A sign-in page that renders
`authError` will explain the failure; one that does not will show an ordinary
signed-out page, which is the pre-existing behaviour.

## Supabase dashboard

**Authentication → URL Configuration**

- *Site URL*: your production origin, e.g. `https://mindful.example.com`.
- *Redirect URLs*: add every origin that may complete a sign-in —
  `http://localhost:5173/**` for development, and the preview-deployment pattern
  if you use one. Supabase matches the `redirectTo` value against this list and
  silently falls back to the Site URL if it does not match, which is the usual
  cause of "it signed me in on the wrong domain".

**Authentication → Providers → Google**

1. Google Cloud console → *APIs & Services* → *Credentials* → *Create OAuth
   client ID* → *Web application*.
2. Authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. This is Supabase's
   callback, not the app's — the app's redirect is the second hop.
3. Paste the client ID and secret into Supabase, and enable the provider.

**Authentication → Providers → Apple**

1. Apple Developer → *Certificates, Identifiers & Profiles*.
2. An App ID with *Sign in with Apple* enabled, then a Services ID — the
   Services ID is the client id for web sign-in.
3. Return URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Create a *Sign in with Apple* key (`.p8`), and give Supabase the key, the key
   id, the team id and the Services ID.

Two things about Apple that catch people out:

- **The client secret expires.** It is a JWT signed with the `.p8` key, valid for
  at most six months. Supabase regenerates it from the key you supplied, but if
  you paste a pre-built secret instead, sign-in will stop working on a date
  nobody wrote down.
- **The account's name is sent once.** Apple includes it only on the first
  consent, and only if it is asked for — which is why `signInWithOAuth` requests
  `name email` for Apple. If the first sign-in is discarded, the name is gone;
  revoking the app under *Settings → Apple ID → Sign in with Apple* on the
  device is the only way to get it offered again.

## What happens to the account

An OAuth signup goes through the same `on_auth_user_created` trigger as an email
signup, so it gets a `profiles` row with `role = 'student'` like everyone else.
The trigger reads `full_name` or `name` from the provider's metadata for
`display_name`, truncated to 120 characters, and **never** reads a role from it.

Supabase links a Google or Apple identity to an existing email account only when
the provider asserts the address is verified. Leave *Confirm email* on, and do
not enable manual linking without reading Supabase's notes on it — an
unverified-email provider plus automatic linking is an account-takeover path.

## Testing it

There is no way to try this on fixtures: `VITE_USE_FIXTURES=true` makes
`signInWithOAuth` return "needs a real Supabase project" rather than simulating
a provider round trip. Point a local dev server at a real project with
`http://localhost:5173/**` on the redirect allow-list.
