# Takda

Student academic task management web app.

## Setup

1. Copy `.env.example` to `.env`.
2. Add your Supabase Project URL and Publishable Key.
3. Run `npm install`.
4. Run `npm run dev`.

## Supabase tables expected

- `subjects`
- `activities`
- `notes`

Row Level Security should be enabled and scoped to `auth.uid() = user_id`.
