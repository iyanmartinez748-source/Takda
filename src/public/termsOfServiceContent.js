// Phase B2 Implementation #3: single source of truth for the Terms of
// Service copy. Extracted verbatim from the text previously inlined in
// LandingPage's legalContent.terms (src/main.jsx) — wording is
// unchanged. Consumed by both the existing Landing Terms modal and the
// standalone /terms page so the two surfaces can never diverge.
const termsOfServiceContent = {
  title: "Terms of Service",
  body: [
    "Takda is a student productivity tool for organizing academic tasks and information. By using Takda, you agree to use the service lawfully and responsibly.",
    "You are responsible for maintaining the security of your account and for the content you add to your workspace.",
    "Takda is provided on an as-available basis. While we work to keep the service reliable, uninterrupted availability or permanent preservation of every item cannot be guaranteed.",
    "Do not misuse the service, attempt unauthorized access, interfere with other users, or upload unlawful or harmful content.",
    "Features and these terms may change as Takda grows. Continued use after an update means you accept the updated terms."
  ],
  lastUpdated: "Last updated: September 2026"
};

export default termsOfServiceContent;
