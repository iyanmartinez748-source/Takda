Self-hosted copies of the two font families the Takda app itself loads
(see `FONT_LINK` in `../../../../src/App.jsx`): Fraunces (display/headline)
and Inter (body/UI). Each file is the "latin" subset variable-font woff2
served by Google's `css2` API for that family — one file per family covers
every weight this project uses (500–700 for Fraunces, 400–700 for Inter).

Downloaded once from:
`https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap`

Self-hosted (rather than fetched at render time via `@remotion/google-fonts`)
because this sandbox's headless Chromium doesn't trust the outbound HTTPS
proxy's certificate for `fonts.gstatic.com`, which makes a live fetch fail
during `remotion render`. Loaded via `@remotion/fonts` in `src/fonts.ts`.
