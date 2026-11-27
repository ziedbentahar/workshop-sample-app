import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../src/store.js';
import { createTodo, deleteTodo, listTodos, updateTodo } from '../src/todos.js';

test('createTodo trims the title and sets defaults', () => {
  const store = createStore();
  const todo = createTodo(store, { title: '  Buy milk ' });
  assert.equal(todo.title, 'Buy milk');
  assert.equal(todo.completed, false);
  assert.match(todo.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(todo.createdAt).toISOString(), todo.createdAt);
});

test('createTodo validates the body and title length', () => {
  const store = createStore();
  for (const input of [null, [], 'x', {}, { title: '   ' }, { title: 'a'.repeat(101) }, { title: 5 }]) {
    assert.throws(() => createTodo(store, input), { status: 400 });
  }
  assert.doesNotThrow(() => createTodo(store, { title: 'a'.repeat(100) }));
});

test('listTodos returns todos in creation order', () => {
  const store = createStore();
  assert.deepEqual(listTodos(store), []);
  createTodo(store, { title: 'one' });
  createTodo(store, { title: 'two' });
  assert.deepEqual(listTodos(store).map((todo) => todo.title), ['one', 'two']);
});

test('updateTodo updates fields and validates input', () => {
  const store = createStore();
  const { id } = createTodo(store, { title: 'one' });
  assert.equal(updateTodo(store, id, { completed: true }).completed, true);
  assert.equal(updateTodo(store, id, { title: ' New ' }).title, 'New');
  for (const input of [{}, null, [], 'x', { completed: 'yes' }, { title: '' }, { title: 'a'.repeat(101) }]) {
    assert.throws(() => updateTodo(store, id, input), { status: 400 });
  }
  assert.equal(store.todos[0].title, 'New');
  assert.throws(() => updateTodo(store, 'missing', { completed: true }), { status: 404, message: 'Todo not found.' });
});

test('deleteTodo removes the todo or throws not found', () => {
  const store = createStore();
  const { id } = createTodo(store, { title: 'one' });
  deleteTodo(store, id);
  assert.deepEqual(store.todos, []);
  assert.throws(() => deleteTodo(store, id), { status: 404, message: 'Todo not found.' });
});
