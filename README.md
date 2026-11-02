# Node.js + Express + Prisma + WebSocket Template

A starter template for real-time web apps. It ships with session-based authentication, a PostgreSQL database via Prisma 7, and Socket.IO connections that are tied to the logged-in user. Build your own pages, API routes and socket events on top of it.

## Features

- **Express 5** server with ES modules
- **Authentication**: register, login and logout with bcrypt-hashed passwords (12 rounds)
- **Postgres-backed sessions** via `express-session` and `connect-pg-simple` (24-hour cookie, `httpOnly`, `sameSite: lax`, `secure` in production)
- **Prisma 7** ORM using the `@prisma/adapter-pg` driver adapter
- **Socket.IO** with session-based socket authentication. Each user is placed in a private `user:<id>` room, so you can push events to a specific user
- **Rate limiting** on auth endpoints (10 failed logins per 15 min, 5 registrations per hour per client)
- **Security basics**: input validation, a constant-time dummy hash comparison to blunt username enumeration, session regeneration on login
- **Public vs. authenticated static assets**, with auth enforced for private files
- **Colorized request logger** and **graceful shutdown** (SIGINT/SIGTERM)
- **Custom error pages** generated from HTTP status codes (including `/coffee` → 418)

## Tech Stack

| Area | Library |
|---|---|
| Server | Express 5, `cookie-parser` |
| Realtime | Socket.IO 4 |
| Database | PostgreSQL, Prisma 7, `pg`, `@prisma/adapter-pg` |
| Sessions | `express-session`, `connect-pg-simple` |
| Auth | `bcrypt`, `express-rate-limit` |
| Config | `dotenv` |
| Dev | `nodemon` |

## Prerequisites

- Node.js 20 or newer
- A running PostgreSQL instance
- npm

## Getting Started

### 1. Install dependencies

```bash
npm install
```

The `postinstall` script runs `prisma generate --config prisma7.config.ts`, which creates the client in `generated/prisma/` (git-ignored).

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
# Server
PROTOCOL=http
HOSTNAME=localhost
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DBNAME

# Sessions: use a long random string
SESSION_SECRET=change-me-to-a-long-random-string
```

| Variable | Purpose |
|---|---|
| `PROTOCOL`, `HOSTNAME`, `PORT` | Used to build the startup URL; `PORT` is also the listen port |
| `NODE_ENV` | Set to `production` to enable `secure` cookies (requires HTTPS) |
| `DATABASE_URL` | Postgres connection string, used by Prisma and the session store |
| `SESSION_SECRET` | Secret used to sign the session cookie |

Generate a good secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Set up the database

Apply the schema in `prisma/schema.prisma` to your database:

```bash
npx prisma migrate dev --config prisma7.config.ts
```

The `session` table is created automatically by `connect-pg-simple` (`createTableIfMissing: true`).

### 4. Run

```bash
npm run dev      # nodemon, auto-restarts on change
# or
node server.js
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the server with nodemon |
| `npm run contract:emit` | Runs `prisma contract emit` |
| `npm test` | Placeholder, no tests yet |

## Project Structure

```
.
├── server.js                # App bootstrap, middleware, routes, graceful shutdown
├── helpers.js               # sendPublic / sendPrivate / fileExists path helpers
├── prisma7.config.ts        # Prisma 7 config (schema path, migrations, datasource)
├── prisma/
│   └── schema.prisma        # Database schema (User model)
├── db/
│   └── prisma.js            # Shared PrismaClient using the pg driver adapter
├── routes/
│   ├── auth.js              # POST /auth/register, /auth/login, /auth/logout
│   ├── pages.js             # HTML page routes (/, /login, /register, /dashboard, /coffee)
│   ├── resources.js         # Static assets served under /src
│   └── middleware.js        # authenticate, authenticateReturn, requestLogger
├── ws/
│   └── socket.js            # Socket.IO init, session auth, emitToUser helper
├── error/
│   └── errorpage.js         # Status-code based HTML error pages
├── images/                  # HTML pages (despite the name)
│   ├── public/              # Served to anyone (index, login, register)
│   └── authenticated/       # Served only to logged-in users
└── resources/               # CSS/JS/SVG served under /src
    ├── public/              # Public assets (style.css, error.css, login.js, register.js)
    └── private/             # Auth-only assets
```

## Routes

### Pages

| Method | Path | Auth | Serves |
|---|---|---|---|
| GET | `/` | No | `images/public/index.html` |
| GET | `/login` | No | `images/public/login.html` |
| GET | `/register` | No | `images/public/register.html` |
| GET | `/dashboard` | Yes | `images/authenticated/dashboard.html` |
| GET | `/coffee` | No | 418 "I'm a teapot" error page |

Unauthenticated requests to protected pages are redirected (307) to `/login`.

### Auth API

All endpoints accept and return JSON in the shape `{ ok: boolean, message: string }`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/auth/register` | `{ username, password }` | `201` and a new session | `400` validation, `409` username taken, `429` rate limited |
| POST | `/auth/login` | `{ username, password }` | `200` and a new session | `401` invalid credentials, `429` rate limited |
| POST | `/auth/logout` | none | `200`, session destroyed and cookie cleared | none |

**Validation rules**

- Username: 3-20 characters, letters, numbers, `_` or `-`
- Password: at least 8 characters, at most 72 bytes (bcrypt's limit)

### Static assets

Files under `/src/...` are looked up first in `resources/public/`, then in `resources/private/` (which requires login). Anything else under `/src` returns 404. In HTML, always reference assets with a `/src` prefix:

```html
<link rel="stylesheet" href="/src/style.css">
<script src="/src/app.js"></script>
```

## WebSockets

Socket.IO is attached to the same HTTP server. The Express session middleware also runs on the socket handshake, so a connection is accepted only if the user has a valid session (`socket.request.session.userId`). Unauthenticated connections are rejected with an `Unauthorized` error.

On connection, each socket:

1. Gets `socket.data.userId` set.
2. Joins the room `user:<userId>`, so you can target a user from anywhere with `io.to(`user:${id}`).emit(...)`.

Use the exported `emitToUser(userId, event, data)` helper to push an event to every open socket of a user from anywhere in your code. Add your own event handlers inside the `io.on('connection', ...)` callback in `ws/socket.js`.

Client example:

```js
// Browser: cookies are sent automatically on same-origin connections
const socket = io();

socket.on('connect_error', (err) => console.error(err.message)); // "Unauthorized"
socket.on('notification', (data) => console.log('Got event', data));
```

## Database

Prisma is configured in `prisma7.config.ts`, which points at `prisma/schema.prisma` and `prisma/migrations`. The included schema has a single model:

```prisma
model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

Add your own models there, then create and apply a migration:

```bash
npx prisma migrate dev --config prisma7.config.ts
```

The generated client lives in `generated/prisma/` (git-ignored) and is created by `npm install` through the `postinstall` script. Import the shared instance from `db/prisma.js`.

## Graceful Shutdown

On `SIGINT` or `SIGTERM` the server:

1. Closes Socket.IO and the HTTP server
2. Closes the session store, the `pg` pool and the Prisma client

If this takes longer than 10 seconds, the process exits with code 1.

## Still To Add

`GET /dashboard` serves `images/authenticated/dashboard.html`, which doesn't exist yet (only a placeholder `index.html` is there). Create it, or point the route in `routes/pages.js` at the page you want logged-in users to land on.

## Known Quirks

- `db/prisma.js` imports `../generated/prisma/client.ts`, which matches the generator output in `prisma/schema.prisma`. If you change the output path, update the import.

## Customizing the Template

1. Replace the placeholder pages in `images/public/` and `images/authenticated/`.
2. Put your CSS, JS and images in `resources/public/` (or the auth-only folder) and reference them with `/src/...`.
3. Add new routers in `routes/` and mount them in `server.js`.
4. Add socket event handlers in `ws/` and register them in the `connection` callback.
5. Extend the Prisma schema, then run `npx prisma migrate dev --config prisma7.config.ts`.

## License

ISC (see `package.json`).