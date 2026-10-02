// Phase B2 Implementation #4: single source of truth for Help & FAQ
// copy, separated from presentation like termsOfServiceContent.js and
// privacyPolicyContent.js. Every answer below describes only currently
// implemented Takda behavior — no invented features, SLAs, or claims.
const helpContent = {
  title: "Help & FAQ",
  intro:
    "Answers to common questions about using Takda. Can't find what you need? Use Contact Support below.",
  sections: [
    {
      title: "Getting Started",
      items: [
        {
          question: "What is Takda?",
          answer:
            "Takda is a student productivity tool for organizing subjects, activities, deadlines, notes, schedules, grades, and other academic work in one place."
        },
        {
          question: "How do I create an account?",
          answer:
            "Create an account using your email address and a password. Follow any account confirmation instructions shown during sign-up."
        },
        {
          question: "How do I log in?",
          answer:
            "Use the email address and password connected to your Takda account."
        },
        {
          question: "What if I forget my password?",
          answer:
            "Use “Forgot password?” on the login screen. Takda will send password-reset instructions to your email. Check your spam folder if the message does not appear."
        }
      ]
    },
    {
      title: "Using Takda",
      items: [
        {
          question: "What are Subjects?",
          answer:
            "Subjects help organize your classes and related academic work, including class details such as schedules, teachers, and rooms where supported."
        },
        {
          question: "What are Activities?",
          answer:
            "Activities are academic tasks such as assignments, projects, quizzes, and other work with deadlines."
        },
        {
          question: "How do semesters work?",
          answer:
            "Takda uses semesters to organize academic records. An active semester is used for current academic work, limits, schedules, reminders, and Smart Insights. Other semesters can still be viewed where supported."
        },
        {
          question: "What can I use the Calendar for?",
          answer:
            "The Calendar helps you view academic dates such as activities, deadlines, and class-related schedules."
        },
        {
          question: "What are Notes?",
          answer:
            "Notes let you keep academic information in your Takda workspace and can be associated with subjects."
        },
        {
          question: "What does My Grades do?",
          answer:
            "My Grades helps you track scores and view subject averages. My Grades is a Takda Pro feature."
        },
        {
          question: "Can activities repeat?",
          answer:
            "Yes. Takda supports recurring activities using daily, weekly, weekdays, or weekends schedules. A repeat-until date can be set when creating a recurring activity."
        },
        {
          question: "How do class reminders work?",
          answer:
            "Class schedules can have notifications enabled with a reminder timing option. Notifications require browser/device permission and supported notification functionality."
        },
        {
          question: "What are Smart Insights?",
          answer:
            "Smart Insights summarizes parts of your current academic workload, such as overdue work, upcoming deadlines, and busy upcoming days. It is based on your Takda academic data and does not automatically change your tasks."
        }
      ]
    },
    {
      title: "Plans & Features",
      items: [
        {
          question: "What can I use on the Free plan?",
          answer:
            "The Free plan supports up to 7 subjects and 20 activities in the active semester, along with Calendar and Notes access."
        },
        {
          question: "What does Takda Pro provide?",
          answer:
            "Takda Pro removes the Free-plan subject and activity limits and includes access to Pro features such as the Grade Tracker. Current pricing is shown inside Takda."
        }
      ]
    }
  ]
};

export default helpContent;
