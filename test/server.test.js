import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createAppServer } from '../src/server.js';

async function setup(t) {
  const server = await createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, options) => fetch(`${base}${path}`, options);
}

const booking = {
  roomId: 'cedar', title: 'Design review', organizer: 'Sam Rivera',
  startTime: '2030-06-12T09:00:00Z', endTime: '2030-06-12T10:00:00Z',
};
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('API lists rooms, creates a booking, and retrieves it', async (t) => {
  const request = await setup(t);
  const rooms = await request('/api/rooms');
  assert.equal(rooms.status, 200);
  assert.match(rooms.headers.get('content-type'), /application\/json/);
  assert.equal((await rooms.json()).length, 3);
  const created = await request('/api/bookings', post(booking));
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.title, booking.title);
  const listed = await request('/api/bookings?roomId=cedar&date=2030-06-12');
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [result]);
});

test('API returns useful validation errors and does not create invalid bookings', async (t) => {
  const request = await setup(t);
  const response = await request('/api/bookings', post({ ...booking, endTime: booking.startTime }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'End time must be after start time.' });
  const listed = await request('/api/bookings?roomId=cedar&date=2030-06-12');
  assert.deepEqual(await listed.json(), []);
});

test('API requires valid room and date filters', async (t) => {
  const request = await setup(t);
  for (const query of ['', '?roomId=missing&date=2030-06-12', '?roomId=cedar&date=2030-02-30']) {
    const response = await request(`/api/bookings${query}`);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('malformed JSON returns 400', async (t) => {
  const request = await setup(t);
  const response = await request('/api/bookings', { ...post(booking), body: '{"title":' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid JSON/);
});

test('wrong content type returns 415', async (t) => {
  const request = await setup(t);
  const response = await request('/api/bookings', { method: 'POST', body: '{}' });
  assert.equal(response.status, 415);
});

test('large requests return 413', async (t) => {
  const request = await setup(t);
  const response = await request('/api/bookings', post({ ...booking, title: 'x'.repeat(20_000) }));
  assert.equal(response.status, 413);
});

test('unknown endpoints return JSON 404 and unsupported methods return 405', async (t) => {
  const request = await setup(t);
  assert.equal((await request('/api/missing')).status, 404);
  const response = await request('/api/bookings', { method: 'DELETE' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST');
});

test('static requests cannot expose application source outside dist', async (t) => {
  const request = await setup(t);
  for (const path of ['/src/server.js', '/..%2fsrc%2fserver.js', '/package.json']) {
    assert.equal((await request(path)).status, 404);
  }
});

test('new server instances do not inherit previous bookings', async (t) => {
  const first = await setup(t);
  await first('/api/bookings', post(booking));
  const second = await setup(t);
  assert.deepEqual(await (await second('/api/bookings?roomId=cedar&date=2030-06-12')).json(), []);
});

test('backend serves no frontend HTML', async (t) => {
  const request = await setup(t);
  const response = await request('/');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'API endpoint not found.' });
});

test('parser errors preserve the JSON error contract', async (t) => {
  const request = await setup(t);
  const malformed = await request('/api/bookings', { ...post(booking), body: '{' });
  assert.deepEqual(await malformed.json(), { error: 'Request body must be valid JSON.' });
  const oversized = await request('/api/bookings', post({ ...booking, title: 'x'.repeat(20_000) }));
  assert.deepEqual(await oversized.json(), { error: 'Request body is too large.' });
});

test('routes remain case-sensitive, exact, and limited to their supported methods', async (t) => {
  const request = await setup(t);
  assert.equal((await request('/api/Rooms')).status, 404);
  assert.equal((await request('/api/rooms/')).status, 404);
  const response = await request('/api/rooms', { method: 'HEAD' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

const patch = (body) => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function createOne(request, body = booking) {
  return (await request('/api/bookings', post(body))).json();
}

test('GET /api/bookings/:id returns the booking or 404', async (t) => {
  const request = await setup(t);
  const created = await createOne(request, { ...booking, notes: '  Bring laptop ' });
  assert.equal(created.notes, 'Bring laptop');
  const found = await request(`/api/bookings/${created.id}`);
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), created);
  const missing = await request('/api/bookings/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Booking not found.' });
});

test('POST rejects invalid notes', async (t) => {
  const request = await setup(t);
  for (const notes of ['a'.repeat(1001), 5]) {
    assert.equal((await request('/api/bookings', post({ ...booking, notes }))).status, 400);
  }
  assert.deepEqual(await (await request('/api/bookings?roomId=cedar&date=2030-06-12')).json(), []);
});

test('PATCH /api/bookings/:id updates only the given fields', async (t) => {
  const request = await setup(t);
  const created = await createOne(request);
  const response = await request(`/api/bookings/${created.id}`, patch({ title: 'New', id: 'other' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...created, title: 'New' });
  assert.deepEqual(await (await request(`/api/bookings/${created.id}`)).json(), { ...created, title: 'New' });
});

test('PATCH with invalid data returns 400 and leaves the booking unchanged', async (t) => {
  const request = await setup(t);
  const created = await createOne(request);
  for (const body of [{ title: ' ' }, { roomId: 'missing' }, { endTime: '2030-06-12T08:00:00Z' }, [], 'text', null]) {
    const response = await request(`/api/bookings/${created.id}`, patch(body));
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const array = await request(`/api/bookings/${created.id}`, patch([]));
  assert.deepEqual(await array.json(), { error: 'Provide a booking object.' });
  assert.deepEqual(await (await request(`/api/bookings/${created.id}`)).json(), created);
});

test('PATCH handles unknown ids, content type, malformed and oversized bodies', async (t) => {
  const request = await setup(t);
  const created = await createOne(request);
  const path = `/api/bookings/${created.id}`;
  assert.equal((await request('/api/bookings/missing', patch({ title: 'New' }))).status, 404);
  assert.equal((await request(path, { method: 'PATCH', body: '{}' })).status, 415);
  const malformed = await request(path, { ...patch({}), body: '{"title":' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Request body must be valid JSON.' });
  assert.equal((await request(path, patch({ title: 'x'.repeat(20_000) }))).status, 413);
  assert.deepEqual(await (await request(path)).json(), created);
});

test('overlapping bookings return 409 on create and update', async (t) => {
  const request = await setup(t);
  const first = await createOne(request);
  const conflict = await request('/api/bookings', post({ ...booking, startTime: '2030-06-12T09:30:00Z', endTime: '2030-06-12T10:30:00Z' }));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: 'This room is already booked at that time.' });
  const next = await createOne(request, { ...booking, startTime: '2030-06-12T10:00:00Z', endTime: '2030-06-12T11:00:00Z' });
  assert.equal(typeof next.id, 'string');
  const moved = await request(`/api/bookings/${next.id}`, patch({ startTime: '2030-06-12T09:00:00Z' }));
  assert.equal(moved.status, 409);
  assert.deepEqual(await moved.json(), { error: 'This room is already booked at that time.' });
  assert.deepEqual(await (await request(`/api/bookings/${next.id}`)).json(), next);
  assert.equal((await request(`/api/bookings/${first.id}`, patch({ title: 'Renamed' }))).status, 200);
});

test('unsupported methods on a booking return 405', async (t) => {
  const request = await setup(t);
  const response = await request('/api/bookings/some-id', { method: 'DELETE' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, PATCH');
});
