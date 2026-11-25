// Phase B2 Implementation #1: minimal, presentational shared chrome for
// Takda's public (non-authenticated-app) pages — currently used only by
// AboutPage. Deliberately owns NO Supabase/session/Pro/payment/ads/
// reminder state: every navigation action is a plain callback prop
// supplied by the caller (Root in src/main.jsx), which remains the sole
// owner of all auth/session decisions. Reuses the exact branding/
// typography/color tokens LandingPage (src/main.jsx) already
// establishes, rather than introducing a new visual language.
//
// Public navigation fix: footer links are real <a href> elements (not
// just onClick buttons) so every public route is crawlable and linked
// from every other public page, with onClick/preventDefault still
// driving the existing navigateTo/pushState SPA navigation — no new
// router, no second popstate listener. Each link is optional (rendered
// only when its callback is supplied) so a caller that omits one simply
// doesn't show it, matching the pre-existing Help/FAQ pattern.
export default function PublicLayout({
  isAuthenticated = false,
  onNavigateHome,
  onNavigateAbout,
  onNavigatePrivacy,
  onNavigateTerms,
  onNavigateHelp,
  onLogin,
  onSignup,
  children,
}) {
  return (
    <div
      className="min-h-screen bg-[var(--takda-bg-page-landing)] text-[color:var(--takda-text-primary)]"
      style={{ fontFamily: '"Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');`}</style>

      <header className="sticky top-0 z-40 border-b border-[var(--takda-border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--takda-focus)] focus-visible:ring-offset-1"
            aria-label="Takda home"
          >
            <img src="/takda-icon.png" alt="" className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-xl font-bold">Takda</span>
          </button>

          <nav className="flex flex-wrap items-center gap-2" aria-label="Public site navigation">
            <button
              type="button"
              onClick={onNavigateHome}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--takda-text-primary)] hover:text-[color:var(--takda-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--takda-focus)] focus-visible:ring-offset-1 sm:px-4"
            >
              Home
            </button>
            {!isAuthenticated && (
              <>
                <button
                  type="button"
                  onClick={onLogin}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--takda-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--takda-focus)] focus-visible:ring-offset-1 sm:px-4"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={onSignup}
                  className="rounded-xl bg-[var(--takda-brand)] px-3 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--takda-text-primary)] focus-visible:ring-offset-1 sm:px-4"
                >
                  Get Started Free
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">{children}</main>

      <footer className="border-t border-[var(--takda-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img src="/takda-icon.png" alt="Takda" className="h-9 w-9 rounded-xl object-cover" />
              <div>
                <p className="text-sm font-extrabold text-[color:var(--takda-text-primary)]">Takda</p>
                <p className="text-xs text-slate-400">Plan • Track • Finish</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-slate-500">
              <a
                href="/"
                onClick={(event) => { event.preventDefault(); onNavigateHome(); }}
                className="hover:text-[color:var(--takda-brand)]"
              >
                Home
              </a>
              {onNavigateAbout && (
                <a
                  href="/about"
                  onClick={(event) => { event.preventDefault(); onNavigateAbout(); }}
                  className="hover:text-[color:var(--takda-brand)]"
                >
                  About
                </a>
              )}
              {onNavigatePrivacy && (
                <a
                  href="/privacy"
                  onClick={(event) => { event.preventDefault(); onNavigatePrivacy(); }}
                  className="hover:text-[color:var(--takda-brand)]"
                >
                  Privacy Policy
                </a>
              )}
              {onNavigateTerms && (
                <a
                  href="/terms"
                  onClick={(event) => { event.preventDefault(); onNavigateTerms(); }}
                  className="hover:text-[color:var(--takda-brand)]"
                >
                  Terms of Service
                </a>
              )}
              {onNavigateHelp && (
                <a
                  href="/help"
                  onClick={(event) => { event.preventDefault(); onNavigateHelp(); }}
                  className="hover:text-[color:var(--takda-brand)]"
                >
                  Help / FAQ
                </a>
              )}
              <a href="mailto:iyanmartinez748@gmail.com?subject=Takda%20Support" className="hover:text-[color:var(--takda-brand)]">
                Contact / Support
              </a>
            </div>
          </div>
          <div className="mt-6 border-t border-[var(--takda-border)] pt-5 text-xs text-slate-400">
            © {new Date().getFullYear()} Takda. Built for students.
          </div>
        </div>
      </footer>
    </div>
  );
}
