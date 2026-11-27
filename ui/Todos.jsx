import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function TodoItem({ todo, onChange, onDelete, onError }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const cancelled = useRef(false);

  async function save() {
    if (cancelled.current) return;
    setEditing(false);
    if (draft.trim() === todo.title) return;
    try {
      onChange(await api(`/todos/${todo.id}`, json('PATCH', { title: draft })));
    } catch (error) {
      onError(error.message);
    }
  }

  async function toggle() {
    try {
      onChange(await api(`/todos/${todo.id}`, json('PATCH', { completed: !todo.completed })));
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <li className="todo-row">
      <input type="checkbox" className="h-4 w-4 accent-emerald-800" checked={todo.completed}
        aria-label={`Mark “${todo.title}” as ${todo.completed ? 'not done' : 'done'}`} onChange={toggle} />
      {editing ? (
        <input autoFocus aria-label="Todo title" className="date-input min-w-0 flex-1" maxLength={100} value={draft}
          onChange={(event) => setDraft(event.target.value)} onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              cancelled.current = true;
              setEditing(false);
            }
          }} />
      ) : (
        <button type="button" className={`todo-title ${todo.completed ? 'done' : ''}`} aria-label={`Edit “${todo.title}”`}
          onClick={() => { cancelled.current = false; setDraft(todo.title); setEditing(true); }}>
          {todo.title}
        </button>
      )}
      <button type="button" className="date-button" aria-label={`Delete “${todo.title}”`} onClick={onDelete}>Delete</button>
    </li>
  );
}

export default function TodosView() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    api('/todos').then((data) => {
      if (!ignore) setTodos(data);
    }).catch((error) => {
      if (!ignore) setError(error.message);
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, [revision]);

  async function add(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = new FormData(form).get('title');
    setActionError('');
    setSaving(true);
    try {
      const todo = await api('/todos', json('POST', { title }));
      setTodos((items) => [...items, todo]);
      form.reset();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(todo) {
    setActionError('');
    try {
      await api(`/todos/${todo.id}`, { method: 'DELETE' });
      setTodos((items) => items.filter((item) => item.id !== todo.id));
    } catch (error) {
      setActionError(error.message);
    }
  }

  const replace = (todo) => {
    setActionError('');
    setTodos((items) => items.map((item) => item.id === todo.id ? todo : item));
  };

  return (
    <main className="page-shell pb-12">
      <section className="mt-9 max-w-2xl" aria-labelledby="todos-heading">
        <h1 id="todos-heading" className="text-4xl tracking-[-0.04em]">
          Your <span className="font-serif italic text-emerald-800">to-dos.</span>
        </h1>
        <div className="schedule-panel mt-6">
          <form onSubmit={add} className="flex gap-2">
            <input name="title" aria-label="New todo" placeholder="What needs doing?" required maxLength={100}
              autoComplete="off" disabled={saving} className="date-input min-w-0 flex-1" />
            <button type="submit" disabled={saving} className="date-button">{saving ? 'Adding…' : 'Add'}</button>
          </form>
          {actionError && <p role="alert" className="error-banner mt-4">{actionError}</p>}
          <div className="mt-5 border-t border-stone-200 pt-5">
            {loading ? <p role="status" className="py-12 text-center text-sm text-stone-500">Loading todos…</p>
              : error ? <div role="alert" className="error-banner">{error} <button className="underline" onClick={() => setRevision((value) => value + 1)}>Retry</button></div>
                : todos.length === 0 ? (
                  <div className="empty-schedule">
                    <h4 className="font-serif text-2xl">Nothing to do.</h4>
                    <p className="mt-2 text-sm text-stone-500">Add your first todo above.</p>
                  </div>
                ) : (
                  <ul className="space-y-2" aria-label="Todos">
                    {todos.map((todo) => (
                      <TodoItem key={todo.id} todo={todo} onChange={replace} onError={setActionError} onDelete={() => remove(todo)} />
                    ))}
                  </ul>
                )}
          </div>
        </div>
      </section>
      <footer className="mt-8 border-t border-stone-300 pt-5 text-xs text-stone-500">
        Todos reset when the server restarts.
      </footer>
    </main>
  );
}
