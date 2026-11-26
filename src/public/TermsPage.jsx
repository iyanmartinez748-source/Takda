import PublicLayout from "./PublicLayout";
import termsOfServiceContent from "./termsOfServiceContent";

// Phase B2 Implementation #3: standalone /terms page. Purely
// presentational — owns no auth/session/Pro/payment/ads state itself;
// isAuthenticated and the navigation callbacks are supplied by Root
// (src/main.jsx), the sole owner of those decisions. Renders the same
// termsOfServiceContent used by the Landing Terms modal, so the
// wording can never drift between the two surfaces.
export default function TermsPage({ isAuthenticated, onNavigateHome, onNavigateAbout, onNavigatePrivacy, onNavigateTerms, onNavigateHelp, onLogin, onSignup }) {
  return (
    <PublicLayout
      isAuthenticated={isAuthenticated}
      onNavigateHome={onNavigateHome}
      onNavigateAbout={onNavigateAbout}
      onNavigatePrivacy={onNavigatePrivacy}
      onNavigateTerms={onNavigateTerms}
      onNavigateHelp={onNavigateHelp}
      onLogin={onLogin}
      onSignup={onSignup}
    >
      <article className="pt-4 sm:pt-0">
        <p className="mb-3 text-sm font-semibold text-[color:var(--takda-brand)]">TAKDA</p>
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{termsOfServiceContent.title}</h1>

        <div className="mt-6 space-y-4 text-sm leading-7 text-[color:var(--takda-text-muted-2)]">
          {termsOfServiceContent.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <p className="mt-6 text-xs text-[color:var(--takda-text-muted-1)]">{termsOfServiceContent.lastUpdated}</p>
      </article>
    </PublicLayout>
  );
}
