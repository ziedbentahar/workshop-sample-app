# Gather — room bookings

A simple room-booking application. Choose a room and date, view its bookings,
book a meeting with optional notes, and edit existing bookings.

## Quick start

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm test
```

Start the backend in one terminal:

```sh
npm run back
```

Start the frontend in another terminal, from the same directory:

```sh
npm run front
```

Open **http://127.0.0.1:5173**. Vite serves React with hot reload and forwards
`/api` requests to the Express backend on port **3000**. Node restarts the backend
when its source files change. Tests only need `npm test`, not running servers.

Bookings live in memory and reset when the server restarts. The three rooms
are seeded automatically; no database, cloud resources, or credentials are
needed. All times are **UTC**.

Both servers listen on `127.0.0.1` by default. This demo has no authentication
and must not be exposed as a public service. To change the backend port, use
`PORT=3001 npm run back` and update the proxy target in `vite.config.js`.

## Architecture

```text
Browser → Vite (:5173) → /api proxy → Express (:3000) → booking rules → in-memory store
```

| Location | Responsibility |
| --- | --- |
| `ui/` | React room picker, schedule, booking form, and Tailwind styles. |
| `src/server.js` | Express API routes, JSON parsing, and error responses. |
| `src/bookings.js` | Input validation and booking rules. |
| `src/store.js` | Three seeded rooms and in-memory bookings. |
| `test/` | Business-rule and HTTP API tests using Node's test runner. |
| `dist/` | Generated frontend build; not committed. |

The frontend calls relative `/api` URLs through Vite's proxy, so no CORS setup
is needed. The backend does not serve frontend files or run Vite.

`npm run build` produces the frontend files in `dist/`. Production hosting is
not configured; Vite is used as a development server.

## API

| Request | Result |
| --- | --- |
| `GET /api/rooms` | `200`: array of rooms (`id`, `name`, `capacity`, `location`, `description`). |
| `GET /api/bookings?roomId=cedar&date=2030-06-12` | `200`: array of bookings touching that UTC date, sorted by start time. Both filters are required. |
| `POST /api/bookings` | `201`: the created booking, including its generated `id`. |
| `GET /api/bookings/:id` | `200`: the booking; `404` if the id is unknown. |
| `PATCH /api/bookings/:id` | `200`: the updated booking. Send only the fields to change (`roomId`, `title`, `organizer`, `startTime`, `endTime`, `notes`); `404` if the id is unknown. |

Example creation:

```sh
curl http://localhost:3000/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{
    "roomId": "cedar",
    "title": "Product brainstorm",
    "organizer": "Alex Morgan",
    "startTime": "2030-06-12T09:00:00Z",
    "endTime": "2030-06-12T10:00:00Z",
    "notes": "Bring a laptop"
  }'
```

Example update (replace `<id>` with the booking's `id`):

```sh
curl -X PATCH http://localhost:3000/api/bookings/<id> \
  -H 'Content-Type: application/json' \
  -d '{"title": "Product review", "notes": ""}'
```

The response preserves those fields, trims the title, organizer, and notes, adds a
UUID `id`, and normalizes timestamps to UTC with milliseconds
(`2030-06-12T09:00:00.000Z`). Unknown input fields are ignored.

A `PATCH` changes only the fields it sends; `id` and unknown fields are ignored
and `{}` changes nothing. The merged booking is validated with the same rules as
a new one, and on any error the stored booking is left unchanged.

- Rooms: `cedar` (4 people), `maple` (8), `aspen` (12).
- Title and organizer: 1–100 characters after trimming.
- Timestamps: valid ISO 8601 UTC strings ending in `Z`, with seconds and
  optional three-digit milliseconds. End must be after start.
- Notes: optional text, at most 1000 characters after trimming. Missing notes
  are stored as `""`.
- No overlaps: a booking cannot overlap another booking in the same room
  (`a.start < b.end && b.start < a.end`). Back-to-back bookings and bookings in
  different rooms are allowed. When updating, the booking itself is ignored.
  Overlaps return `409` with
  `{"error":"This room is already booked at that time."}`.
- Multi-day bookings are supported by the API and appear on each affected date.
  The browser form creates bookings within its selected day, and does not edit
  the times of multi-day bookings.
- Validation errors and malformed JSON return `400` and are checked before
  overlaps (`409`). For `POST` and `PATCH`, a wrong content type returns `415`
  and bodies larger than 16 KiB return `413`.
- Errors have the shape `{"error":"Helpful message"}`. Unknown routes and
  unknown booking ids return `404`; unsupported methods return `405` with an
  `Allow` header (`GET, POST` on `/api/bookings`, `GET, PATCH` on
  `/api/bookings/:id`).
