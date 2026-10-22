# express-mongo-auth

User authentication (registration / login) and role-based authorization built with **Express**, **MongoDB (Mongoose)** and **JWT**, plus a demo client.

The repo is an npm workspaces monorepo:

- `server/`: the Express + MongoDB API
- `client/`: a Vite (vanilla JS) demo client that exercises every endpoint

## Features

- Registration and login with `bcrypt`-hashed passwords
- Short-lived **access tokens** (JWT, sent as `Authorization: Bearer <token>`)
- Long-lived **refresh tokens** stored hashed in MongoDB, delivered as an `httpOnly` cookie (and in the JSON body for non-browser clients)
- Refresh-token **rotation with reuse detection** (reusing an old refresh token revokes all sessions)
- Per-user `tokenVersion` embedded in every token: logout-all, password change and reuse detection bump it, so existing **access tokens are rejected immediately**, not just at expiry
- Refresh-token writes are single atomic MongoDB updates, so a refresh racing with a revocation can't restore a revoked session
- Logout, logout from all devices, change password (revokes other sessions)
- Role-based authorization middleware: `authenticate` + `authorize('admin', ...)`
- Admin-only user management endpoints
- Request validation with `zod`, `helmet`, CORS, rate limiting on login/register, centralized error handling
- Jest + Supertest integration tests using an in-memory MongoDB

## Getting started

Requirements: Node.js 20.19+ and a MongoDB instance (local, Docker, or Atlas).

```bash
npm install                              # installs both workspaces
cp server/.env.example server/.env       # then set MONGO_URI and JWT secrets
npm run dev                              # API on :5000 + client on :3000
```

Open [http://localhost:3000](http://localhost:3000). Quick local MongoDB with Docker:

```bash
docker run -d --name mongo -p 27017:27017 mongo:7
```

Create the first admin (or promote an existing user):

```bash
npm run create-admin -- admin@example.com 'AdminPass1' "Admin"
```

## Demo client

The client in `client/` covers every endpoint: register/login (with field-level validation errors), profile (`/me`),
a live access-token expiry meter, manual and automatic token refresh (the session is restored from the cookie on
page load), logout / logout everywhere, change password, a 403 demo for regular users, and an admin panel to list,
paginate, view, re-role and delete users. The **API console** shows the last status code for each route and a
request log (passwords masked, tokens truncated). It follows the OS light/dark preference.

How it talks to the API:

- **Development**: Vite runs on `:3000` and proxies `/api` to `:5000` (override with `API_PROXY_TARGET`), so the
  browser sees one origin and the `httpOnly` refresh cookie works with no CORS setup.
- **Production (single deploy)**: `npm run build` writes `client/dist`; the API serves it automatically when that
  folder exists (path configurable with `CLIENT_DIST`). Run `npm start` and open `http://localhost:5000`.
- **Separate deploy**: build with `VITE_API_URL=https://api.example.com`, set `CORS_ORIGIN` to the client's origin
  on the server, and `COOKIE_SAMESITE=none` if the two are on different sites (requires HTTPS).

## Environment variables

Server variables go in `server/.env`.

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `5000` |
| `MONGO_URI` | MongoDB connection string | — (required) |
| `JWT_ACCESS_SECRET` | Secret for access tokens | — (required) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | — (required) |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `BCRYPT_SALT_ROUNDS` | bcrypt cost factor | `12` |
| `CORS_ORIGIN` | Comma-separated trusted origins (credentials allowed). `*` = any origin **without** credentials. Unset = no cross-origin access | unset |
| `COOKIE_SAMESITE` | `SameSite` of the refresh cookie: `strict`, `lax` or `none`. Use `none` when the frontend is on a different site (forces `Secure`, so HTTPS is required) | `strict` |
| `CLIENT_DIST` | Built client to serve from the API (only if the folder exists) | `client/dist` |

## API

All responses are JSON. Errors look like `{ "success": false, "message": "...", "errors": [...] }`.

### Auth — `/api/auth`

| Method | Path | Auth | Body | Description |
| --- | --- | --- | --- | --- |
| POST | `/register` | — | `{ name, email, password }` | Create account, returns user + tokens |
| POST | `/login` | — | `{ email, password }` | Returns user + tokens |
| POST | `/refresh` | refresh cookie or `{ refreshToken }` | | Rotates refresh token, returns new tokens |
| POST | `/logout` | refresh cookie or `{ refreshToken }` | | Revokes the current refresh token |
| POST | `/logout-all` | Bearer | | Revokes all refresh tokens for the user |
| GET | `/me` | Bearer | | Current user |
| PATCH | `/password` | Bearer | `{ currentPassword, newPassword }` | Change password, revokes other sessions |

Password rules: 8–128 characters with at least one lowercase letter, one uppercase letter and one number. Clients cannot set their own `role` on registration.

### Users — `/api/users` (admin only)

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| GET | `/?page=1&limit=20` | | Paginated user list (`page` ≥ 1, `limit` 1–100, integers) |
| GET | `/:id` | | Get a user |
| PATCH | `/:id/role` | `{ role: "user" \| "admin" }` | Change a user's role |
| DELETE | `/:id` | | Delete a user |

### Example

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com","password":"Password1"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password1"}'

# Authenticated request
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <accessToken>"
```

### Protecting your own routes

```js
const { authenticate, authorize } = require('./middleware/auth');

router.get('/profile', authenticate, handler);                       // any logged-in user
router.delete('/posts/:id', authenticate, authorize('admin'), handler); // admins only
```

## Project structure

```
package.json             workspaces + root scripts
server/
  src/
    app.js               Express app (middleware + routes, serves client/dist if built)
    server.js            DB connection + HTTP server
    config/              env + MongoDB connection
    models/User.js       User schema, password hashing, refresh token storage
    controllers/         auth + admin user handlers
    routes/              /api/auth and /api/users
    middleware/          authenticate/authorize, validation, errors
    validators/          zod request schemas
    utils/               JWT helpers, ApiError, asyncHandler
    scripts/createAdmin.js
  tests/auth.test.js     integration tests
client/
  index.html             page markup
  vite.config.js         dev server on :3000 with /api proxy
  src/
    main.js              session, rendering, event wiring
    api.js               fetch wrapper (Bearer token, silent refresh + retry)
    console.js           endpoint catalog + request log (with redaction)
    dom.js               DOM builder + toasts
    styles.css           light/dark theme
```

## Scripts (run from the repo root)

- `npm run dev`: API (nodemon) and client (Vite) together; `dev:server` / `dev:client` for one
- `npm run build`: build the client into `client/dist`
- `npm start`: start the API (serves `client/dist` if built)
- `npm test`: server tests (downloads a MongoDB binary on first run)
- `npm run lint`: ESLint for both workspaces
- `npm run create-admin -- <email> <password> [name]`
