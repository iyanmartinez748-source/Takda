import PublicLayout from "./PublicLayout";

// Phase B2 Implementation #1: standalone /about page. Purely
// presentational — owns no auth/session/Pro/payment/ads state itself;
// isAuthenticated and the navigation callbacks are supplied by Root
// (src/main.jsx), the sole owner of those decisions. Every feature
// listed below is an already-verified, currently-shipped Takda
// capability — nothing here is an invented or unsupported claim.
export default function AboutPage({ isAuthenticated, onNavigateHome, onNavigateAbout, onNavigatePrivacy, onNavigateTerms, onNavigateHelp, onLogin, onSignup }) {
  const features = [
    ["📚", "Subjects", "Keep classes, schedules, teachers, and rooms organized in one place."],
    ["✅", "Activities & Deadlines", "Track assignments, projects, quizzes, and due dates."],
    ["📅", "Calendar", "See upcoming classes and deadlines at a glance."],
    ["📝", "Notes", "Keep notes connected to the right subject."],
    ["📊", "Grades", "Record scores and see subject averages."],
    ["🗓️", "Semesters & Class Schedules", "Organize academic terms and recurring class times."],
    ["🔁", "Recurring Activities", "Create a repeating task once instead of re-adding it every time."],
    ["🔔", "Reminders & Smart Insights", "Get deadline reminders and a quick, data-based summary of upcoming workload."],
  ];

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
      <article>
        <p className="mb-3 text-sm font-semibold text-[#3D2FE0]">ABOUT TAKDA</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">About Takda</h1>
        <p className="mt-5 text-base leading-7 text-slate-600">
          Takda is an academic planning workspace designed to help students organize school
          responsibilities in one place.
        </p>

        <h2 className="mt-10 text-xl font-bold">What students can organize</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {features.map(([icon, title, description]) => (
            <div key={title} className="rounded-2xl border border-[#E4E4F0] bg-white p-5">
              <div className="mb-2 text-2xl" aria-hidden="true">
                {icon}
              </div>
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-bold">Our purpose</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Takda aims to make academic planning simpler by giving students a clear place to
          organize what they need to do and when they need to do it.
        </p>

        <h2 className="mt-10 text-xl font-bold">Free and Pro</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Takda offers a Free experience for getting started, and a Pro experience with
          additional capacity and features for students who want more.
        </p>
      </article>
    </PublicLayout>
  );
}
