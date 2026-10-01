import PublicLayout from "./PublicLayout";
import privacyPolicyContent from "./privacyPolicyContent";

// Phase B2 Implementation #2: standalone /privacy page. Purely
// presentational — owns no auth/session/Pro/payment/ads state itself;
// isAuthenticated and the navigation callbacks are supplied by Root
// (src/main.jsx), the sole owner of those decisions. Renders the same
// privacyPolicyContent used by the Landing Privacy modal, so the
// wording can never drift between the two surfaces.
export default function PrivacyPage({ isAuthenticated, onNavigateHome, onLogin, onSignup }) {
  return (
    <PublicLayout
      isAuthenticated={isAuthenticated}
      onNavigateHome={onNavigateHome}
      onLogin={onLogin}
      onSignup={onSignup}
    >
      <article className="pt-4 sm:pt-0">
        <p className="mb-3 text-sm font-semibold text-[#3D2FE0]">TAKDA</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{privacyPolicyContent.title}</h1>

        <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600">
          {privacyPolicyContent.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <p className="mt-6 text-xs text-slate-400">{privacyPolicyContent.lastUpdated}</p>
      </article>
    </PublicLayout>
  );
}
