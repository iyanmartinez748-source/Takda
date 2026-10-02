import PublicLayout from "./PublicLayout";
import helpContent from "./helpContent";

// Phase B2 Implementation #4: standalone /help page. Purely
// presentational — owns no auth/session/Pro/payment/ads state itself;
// isAuthenticated and the navigation callbacks are supplied by Root
// (src/main.jsx), the sole owner of those decisions. FAQ content is
// imported from helpContent so wording lives in one place.
export default function HelpPage({ isAuthenticated, onNavigateHome, onNavigateHelp, onLogin, onSignup }) {
  return (
    <PublicLayout
      isAuthenticated={isAuthenticated}
      onNavigateHome={onNavigateHome}
      onNavigateHelp={onNavigateHelp}
      onLogin={onLogin}
      onSignup={onSignup}
    >
      <article className="pt-4 sm:pt-0">
        <p className="mb-3 text-sm font-semibold text-[#3D2FE0]">TAKDA</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{helpContent.title}</h1>
        <p className="mt-5 text-base leading-7 text-slate-600">{helpContent.intro}</p>

        {helpContent.sections.map((section) => (
          <div key={section.title} className="mt-10">
            <h2 className="text-xl font-bold">{section.title}</h2>
            <div className="mt-4 space-y-5">
              {section.items.map((item) => (
                <div key={item.question}>
                  <h3 className="font-bold text-[#1B1B2F]">{item.question}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-slate-600">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-10">
          <h2 className="text-xl font-bold">Contact Support</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Still need help? Reach out at{" "}
            <a href="mailto:iyanmartinez748@gmail.com?subject=Takda%20Support" className="font-semibold text-[#3D2FE0] hover:underline">
              Contact / Support
            </a>
            .
          </p>
        </div>
      </article>
    </PublicLayout>
  );
}
