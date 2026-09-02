# Meta Marketing Setup

1. Create/configure the Meta Developer App for Anaira.
2. Add the Facebook/Instagram products and request the permissions required by your publishing/insights features.
3. Set `META_APP_ID` and `META_APP_SECRET` on the server only.
4. Set `META_REDIRECT_URI` to the exact public callback URL shown in Super Admin → Marketing.
5. Add that exact URL to the Meta app OAuth redirect allow-list.
6. Restart/redeploy the Next.js server after environment changes.
7. Super Admin → Marketing → Facebook/Instagram → Connect with Meta. Meta opens its own login/permission screen; Anaira then shows a Page/Instagram account chooser if multiple accounts are returned.
8. WhatsApp Cloud API marketing remains separate from transactional WhatsApp Invoice. Configure WABA ID, Phone Number ID and a valid token, or add Meta Embedded Signup later when the business onboarding flow is enabled for the app.

Never store or expose `META_APP_SECRET` in frontend code or browser storage.
