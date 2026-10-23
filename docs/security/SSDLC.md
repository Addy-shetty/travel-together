# Secure development lifecycle (SSDLC)

Every feature of Travel-Together goes through these gates. A feature is not "done" until
all of them pass and its section in [threat-model.md](threat-model.md) is up to date.

## 1. Requirements
- Write down what the feature does, who can do it (anonymous, member, Head, receiver of a payment)
  and what data it touches (money, phone numbers, UPI IDs, locations, receipts).
- Note abuse cases next to use cases ("a member tries to confirm their own pool payment").

## 2. Threat model (before code)
- Add a section to `threat-model.md`: data flow, trust boundaries, then a STRIDE table
  (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege).
- Every threat gets a mitigation, a test or check that proves it, or an explicit accepted-risk entry.

## 3. Secure design rules
- **Server decides.** Authorization and money rules live in Postgres (RLS + SECURITY DEFINER functions with
  `search_path = ''`). The app is untrusted; it only reads through RLS and writes through RPCs.
- **Least privilege.** `anon` gets nothing; `authenticated` gets only listed columns/functions.
- **Secrets never ship.** The app holds only the publishable key. Service-role/secret keys never go in the app,
  in git, or in logs.
- **Tokens at rest are encrypted.** Sessions live in SecureStore (Keychain/Keystore), never AsyncStorage.
- **Validate at every boundary.** Phone, UPI ID, amounts, deep links: validate in the app for UX and again in
  the database for security.
- **Money is integer paise.** No floating point anywhere money is computed.

## 4. Implementation rules
- Dependencies: prefer Expo/Supabase first-party packages; add a third-party package only with a reason
  recorded in the PR; install with `npx expo install` (exact compatible versions) and commit the lockfile.
- No `eval`, no dynamic `require`, no `dangerouslySetInnerHTML`/WebView with remote HTML.
- No PII or tokens in `console.*`; production builds strip logs.
- Errors shown to users are mapped from known codes; raw server errors are never displayed.

## 5. Verification (must pass before merge)
| Check | Command |
|---|---|
| Database tests (authz, money maths, abuse cases) | `supabase test db` (local) and `supabase test db --linked` |
| Database lint | `supabase db lint --level warning` |
| Supabase security advisors | dashboard / MCP `get_advisors` |
| Type check | `cd app && npm run typecheck` |
| Lint | `cd app && npm run lint` |
| Dependency audit + secret scan | `cd app && npm run security` — fails on any advisory not in `security/accepted-advisories.json`, on expired acceptances, and on secrets in tracked files |

## 6. Release
- Re-run section 5 on the release commit.
- Review `accepted-advisories.json`: anything past its `reviewBy` date blocks the release.
- Production build: `eas build` with secrets from EAS environment variables, never from committed files.

## 7. Respond
- Rotate keys from the Supabase dashboard if one leaks; revoke sessions with `auth.admin.signOut`.
- New advisory in a dependency → the security check fails in CI → fix, upgrade, or record a dated acceptance.
