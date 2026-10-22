# express-mongo-auth

User authentication (registration / login) and role-based authorization API built with **Express**, **MongoDB (Mongoose)** and **JWT**.

## Features

- Registration and login with `bcrypt`-hashed passwords
- Short-lived **access tokens** (JWT, sent as `Authorization: Bearer <token>`)
- Long-lived **refresh tokens** stored hashed in MongoDB, delivered as an `httpOnly` cookie (and in the JSON body for non-browser clients)
- Refresh-token **rotation with reuse detection** (reusing an old refresh token revokes all sessions)
- Logout, logout from all devices, change password (revokes other sessions)
- Role-based authorization middleware: `authenticate` + `authorize('admin', ...)`
- Admin-only user management endpoints
- Request validation with `zod`, `helmet`, CORS, rate limiting on login/register, centralized error handling
- Jest + Supertest integration tests using an in-memory MongoDB

## Getting started

Requirements: Node.js 18+ and a MongoDB instance (local, Docker, or Atlas).

```bash
npm install
cp .env.example .env        # then set MONGO_URI and JWT secrets
npm run dev                 # or: npm start
```

Quick local MongoDB with Docker:

```bash
docker run -d --name mongo -p 27017:27017 mongo:7
```

Create the first admin (or promote an existing user):

```bash
npm run create-admin -- admin@example.com 'AdminPass1' "Admin"
```

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `5000` |
| `MONGO_URI` | MongoDB connection string | — (required) |
| `JWT_ACCESS_SECRET` | Secret for access tokens | — (required) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | — (required) |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `BCRYPT_SALT_ROUNDS` | bcrypt cost factor | `12` |
| `CORS_ORIGIN` | Comma-separated allowed origins, or `*` | `*` |

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
| GET | `/?page=1&limit=20` | | Paginated user list |
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
src/
  app.js                 Express app (middleware + routes)
  server.js              DB connection + HTTP server
  config/                env + MongoDB connection
  models/User.js         User schema, password hashing, refresh token storage
  controllers/           auth + admin user handlers
  routes/                /api/auth and /api/users
  middleware/            authenticate/authorize, validation, errors
  validators/            zod request schemas
  utils/                 JWT helpers, ApiError, asyncHandler
  scripts/createAdmin.js create/promote an admin
tests/auth.test.js       integration tests
```

## Scripts

- `npm run dev` — start with nodemon
- `npm start` — start in production mode
- `npm test` — run tests (downloads a MongoDB binary on first run)
- `npm run lint` — ESLint
- `npm run create-admin -- <email> <password> [name]`
