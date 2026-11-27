import { randomUUID } from 'node:crypto';
import { ValidationError } from './bookings.js';

export class NotFoundError extends Error {
  status = 404;
}

function requireObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Provide a todo object.');
  }
}

function parseTitle(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new ValidationError('Title must contain 1–100 characters.');
  }
  return value.trim();
}

function parseCompleted(value) {
  if (typeof value !== 'boolean') throw new ValidationError('Completed must be true or false.');
  return value;
}

function findTodo(store, id) {
  const index = store.todos.findIndex((todo) => todo.id === id);
  if (index === -1) throw new NotFoundError('Todo not found.');
  return index;
}

export function listTodos(store) {
  return [...store.todos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createTodo(store, input) {
  requireObject(input);
  const todo = {
    id: randomUUID(),
    title: parseTitle(input.title),
    completed: false,
    createdAt: new Date().toISOString(),
  };
  store.todos.push(todo);
  return todo;
}

export function updateTodo(store, id, input) {
  requireObject(input);
  const hasTitle = 'title' in input;
  const hasCompleted = 'completed' in input;
  if (!hasTitle && !hasCompleted) throw new ValidationError('Provide a title or completed value.');
  const title = hasTitle ? parseTitle(input.title) : undefined;
  const completed = hasCompleted ? parseCompleted(input.completed) : undefined;
  const todo = store.todos[findTodo(store, id)];
  if (hasTitle) todo.title = title;
  if (hasCompleted) todo.completed = completed;
  return todo;
}

export function deleteTodo(store, id) {
  store.todos.splice(findTodo(store, id), 1);
}
