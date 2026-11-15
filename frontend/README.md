# Frontend

The React and TypeScript interface of the AI Audio Assistant for Producers. The project as a whole, with the idea behind it, the backend and the deployment notes, is described in the [root README](../README.md).

## Run it

Requirements: Node 22 or newer, and the backend running (see the root README).

```bash
npm install
cp .env.example .env
npm run dev
```

The app is at http://localhost:5173. The port is fixed, because the API's CORS list names it, and Vite refuses to start if it is taken.

## Scripts

| Script                 | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Dev server                                                      |
| `npm test`             | Runs the tests once (`npm run test:watch` watches)              |
| `npm run typecheck`    | TypeScript check                                                |
| `npm run lint`         | ESLint                                                          |
| `npm run format:check` | Prettier check (`npm run format` writes)                        |
| `npm run build`        | Type check and production build into `dist`                     |
| `npm run api:types`    | Regenerates `src/api/schema.d.ts` from `../schema/openapi.json` |

Run npm commands from this folder.

## Settings

| Variable             | Default                 | Meaning                                                                                                |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `VITE_API_URL`       | `http://127.0.0.1:8000` | Where the API is. Its origin has to be allowed by the API's `CORS_ORIGINS`                             |
| `VITE_MAX_UPLOAD_MB` | `100`                   | Largest file the upload dialog accepts. A convenience check only; the server's `MAX_UPLOAD_MB` decides |

Vite reads these when it starts or builds, so a change needs a restart or a rebuild.

## How it is built

- The API client is typed from `../schema/openapi.json`. Every failed request becomes one `ApiError`, and the code branches on `error.code`, never on the message.
- Server state uses TanStack Query. The version list and the version page poll while an analysis is pending or running.
- Forms use react-hook-form. Dialogs are native `<dialog>` elements.
- The `metrics` and `feedback` objects are checked at runtime before they are shown.
- Styles are CSS Modules that use tokens from `src/index.css`. The dark tokens are written twice (the system preference and the manual override), and a test fails if the two copies differ.
- Tests use Vitest, Testing Library, MSW for the API and vitest-axe. A page that gains a request needs a mock for it in every test that renders the page.

The reasons behind these choices are in [`../docs/DECISIONS.md`](../docs/DECISIONS.md).
