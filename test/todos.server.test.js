import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createAppServer } from '../src/server.js';

async function setup(t) {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, options) => fetch(`${base}${path}`, options);
}

const send = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('creates and lists todos in order', async (t) => {
  const request = await setup(t);
  assert.deepEqual(await (await request('/api/todos')).json(), []);
  const created = await request('/api/todos', send('POST', { title: '  Buy milk ' }));
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const todo = await created.json();
  assert.equal(todo.title, 'Buy milk');
  assert.equal(todo.completed, false);
  await request('/api/todos', send('POST', { title: 'Second' }));
  const list = await (await request('/api/todos')).json();
  assert.deepEqual(list.map((item) => item.title), ['Buy milk', 'Second']);
});

test('updates todos and rejects invalid patches', async (t) => {
  const request = await setup(t);
  const todo = await (await request('/api/todos', send('POST', { title: 'One' }))).json();
  const done = await request(`/api/todos/${todo.id}`, send('PATCH', { completed: true }));
  assert.equal(done.status, 200);
  assert.equal((await done.json()).completed, true);
  const renamed = await (await request(`/api/todos/${todo.id}`, send('PATCH', { title: 'New' }))).json();
  assert.equal(renamed.title, 'New');
  for (const body of [{}, 5, [], { completed: 'x' }, { title: '' }, { title: 'a'.repeat(101) }]) {
    const response = await request(`/api/todos/${todo.id}`, send('PATCH', body));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
});

test('deletes todos and returns 404 for unknown ids', async (t) => {
  const request = await setup(t);
  const todo = await (await request('/api/todos', send('POST', { title: 'One' }))).json();
  const removed = await request(`/api/todos/${todo.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
  assert.deepEqual(await (await request('/api/todos')).json(), []);
  for (const options of [{ method: 'DELETE' }, send('PATCH', { completed: true })]) {
    const response = await request(`/api/todos/${todo.id}`, options);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Todo not found.' });
  }
});

test('rejects wrong content type and methods', async (t) => {
  const request = await setup(t);
  const post = await request('/api/todos', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(post.status, 415);
  const patch = await request('/api/todos/x', { method: 'PATCH', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(patch.status, 415);
  const put = await request('/api/todos', { method: 'PUT' });
  assert.equal(put.status, 405);
  assert.ok(put.headers.get('allow'));
  const get = await request('/api/todos/x');
  assert.equal(get.status, 405);
  assert.ok(get.headers.get('allow'));
});
