// Phase B2 Implementation #2: single source of truth for the Privacy
// Policy copy. Extracted verbatim from the text previously inlined in
// LandingPage's legalContent.privacy (src/main.jsx) — wording is
// unchanged. Consumed by both the existing Landing Privacy modal and
// the standalone /privacy page so the two surfaces can never diverge.
const privacyPolicyContent = {
  title: "Privacy Policy",
  body: [
    "Takda collects account information such as your email address and the profile details you choose to provide so the app can provide your student workspace.",
    "Academic information you add, such as subjects, activities, grades, calendar items, and notes, is used to provide Takda's features and is associated with your account.",
    "Takda uses service providers, including Supabase for authentication and data storage and Vercel for website hosting. We do not sell your personal information.",
    "You are responsible for the information you choose to enter. Avoid storing highly sensitive information that is not necessary for managing your schoolwork.",
    "This policy may be updated as Takda develops. Material changes should be reflected on this page."
  ],
  lastUpdated: "Last updated: September 2026"
};

export default privacyPolicyContent;
