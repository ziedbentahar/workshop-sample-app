import { useEffect, useRef, useState } from 'react';

const today = () => new Date().toISOString().slice(0, 10);
const timeLabel = (value) => value.slice(11, 16);
const dateLabel = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
});

async function api(path, options) {
  const response = await fetch(`/api${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete the request.');
  return body;
}

function RoomSketch({ capacity }) {
  const chairs = capacity === 4 ? 2 : capacity === 8 ? 3 : 4;
  return (
    <div className="room-sketch" aria-hidden="true">
      <div className="chair-row">{Array.from({ length: chairs }, (_, i) => <span key={i} />)}</div>
      <div className="meeting-table"><span /><span /></div>
      <div className="chair-row bottom">{Array.from({ length: chairs }, (_, i) => <span key={i} />)}</div>
    </div>
  );
}

const isSingleDay = (booking) => booking.startTime.slice(0, 10) === booking.endTime.slice(0, 10);

function BookingForm({ room, date, booking, onSaved, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(booking);
  const showTimes = !editing || isSingleDay(booking);
  const timeDate = editing ? booking.startTime.slice(0, 10) : date;

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = {
      title: fields.get('title'),
      organizer: fields.get('organizer'),
      notes: fields.get('notes'),
    };
    if (showTimes) {
      body.startTime = `${timeDate}T${fields.get('startTime')}:00Z`;
      body.endTime = `${timeDate}T${fields.get('endTime')}:00Z`;
    }
    setError('');
    setSaving(true);
    try {
      const saved = await api(editing ? `/bookings/${encodeURIComponent(booking.id)}` : '/bookings', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? body : { roomId: room.id, ...body }),
      });
      if (!editing) form.reset();
      onSaved(saved);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="booking-panel">
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow">{editing ? 'Fine-tune it' : 'Make it happen'}</span>
        <span className="rounded-full border border-white/20 px-2.5 py-1 text-xs">UTC</span>
      </div>
      <h2 className="mt-6 break-words text-3xl tracking-tight">{editing ? `Edit “${booking.title}”.` : `Book ${room.name}.`}</h2>
      <p className="mt-2 text-sm text-white/70">{dateLabel(date)} · Up to {room.capacity} people</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
          <label className="field-label">
            Meeting title
            <input name="title" placeholder="e.g. Product brainstorm" required maxLength={100} defaultValue={booking?.title} />
          </label>
          <label className="field-label">
            Organizer
            <input name="organizer" placeholder="e.g. Alex Morgan" required maxLength={100} autoComplete="off" defaultValue={booking?.organizer} />
          </label>
          {showTimes ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                Start time
                <input name="startTime" type="time" defaultValue={editing ? timeLabel(booking.startTime) : '09:00'} step="60" required />
              </label>
              <label className="field-label">
                End time
                <input name="endTime" type="time" defaultValue={editing ? timeLabel(booking.endTime) : '10:00'} step="60" required />
              </label>
            </div>
          ) : (
            <p className="rounded-lg border border-white/20 p-3 text-xs leading-relaxed text-white/75">
              {booking.startTime.slice(0, 10)} {timeLabel(booking.startTime)} → {booking.endTime.slice(0, 10)} {timeLabel(booking.endTime)} UTC.
              Times of multi-day bookings can't be edited here.
            </p>
          )}
          <label className="field-label">
            Notes <span className="font-normal text-white/60">(optional)</span>
            <textarea name="notes" rows={3} maxLength={1000} placeholder="e.g. Bring a laptop" defaultValue={booking?.notes} />
          </label>
          {error && <p role="alert" className="rounded-xl bg-white p-3 text-sm text-red-800">{error}</p>}
          <button className="book-button" type="submit">
            {editing ? (saving ? 'Saving…' : 'Save changes') : (saving ? 'Booking…' : 'Confirm booking')} <span aria-hidden="true">↗</span>
          </button>
          {editing && <button className="cancel-button" type="button" onClick={onCancel}>Cancel</button>}
        </fieldset>
      </form>
      <p className="mt-5 text-xs leading-relaxed text-white/60">
        All times are UTC.
      </p>
    </aside>
  );
}

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('cedar');
  const [date, setDate] = useState(today);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState('');
  const editRequest = useRef(0);
  const room = rooms.find((item) => item.id === roomId);

  useEffect(() => {
    let ignore = false;
    api('/rooms').then((data) => {
      if (!ignore) setRooms(data);
    }).catch((error) => {
      if (!ignore) setRoomError(error.message);
    });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    api(`/bookings?${new URLSearchParams({ roomId, date })}`).then((data) => {
      if (!ignore) setBookings(data);
    }).catch((error) => {
      if (!ignore) setError(error.message);
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, [roomId, date, revision]);

  function leaveEditMode() {
    editRequest.current += 1;
    setEditing(null);
    setEditError('');
  }

  function changeDate(value) {
    if (!value) return;
    setDate(value);
    setNotice('');
    leaveEditMode();
  }

  async function startEditing(id) {
    const request = ++editRequest.current;
    setEditError('');
    try {
      const booking = await api(`/bookings/${encodeURIComponent(id)}`);
      if (request === editRequest.current) setEditing(booking);
    } catch (error) {
      if (request === editRequest.current) setEditError(error.message);
    }
  }

  function shiftDate(days) {
    const shifted = new Date(`${date}T12:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    changeDate(shifted.toISOString().slice(0, 10));
  }

  return (
    <div className="min-h-screen">
      <header className="page-shell flex items-center justify-between gap-4 py-6">
        <a href="/" className="flex items-center gap-3 text-2xl font-semibold tracking-tight" aria-label="Gather home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          gather<span className="-ml-2 text-emerald-700">.</span>
        </a>
        <span className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600">Room bookings</span>
      </header>

      <main className="page-shell pb-12">
        <section className="hero">
          <div>
            <p className="eyebrow text-stone-500">Good work starts with a little space</p>
            <h1 className="mt-4 text-4xl leading-[1.08] tracking-[-0.045em] sm:text-6xl">
              Your next idea.<br /><span className="font-serif italic text-emerald-800">The right room.</span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-stone-600">
              A quick catch-up or a big brainstorm. Choose your space, find a time, and bring people together.
            </p>
          </div>
          <div className="hidden items-end gap-3 text-right md:flex">
            <span className="font-serif text-7xl italic text-emerald-800">03</span>
            <p className="pb-2 text-xs leading-relaxed text-stone-500">thoughtful spaces.<br />room for everyone.</p>
          </div>
        </section>

        <section aria-labelledby="rooms-heading" className="mt-9">
          <div className="mb-4 flex items-center gap-3">
            <span className="step-number">01</span>
            <h2 id="rooms-heading" className="text-sm font-semibold">Choose your room</h2>
          </div>
          {roomError && <p role="alert" className="error-banner">{roomError} Refresh the page to retry.</p>}
          {!rooms.length && !roomError && <p role="status" className="p-8 text-stone-500">Loading rooms…</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            {rooms.map((item, index) => (
              <button type="button" key={item.id} aria-pressed={roomId === item.id}
                aria-label={`${item.name}, ${item.capacity} people, ${item.location}`}
                className={`room-card room-${index} ${roomId === item.id ? 'selected' : ''}`}
                onClick={() => { setRoomId(item.id); setNotice(''); leaveEditMode(); }}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">{item.location}</span>
                  <span className="selection-dot" aria-hidden="true">{roomId === item.id ? '✓' : ''}</span>
                </div>
                <RoomSketch capacity={item.capacity} />
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-tight">{item.name}</h3>
                  <span className="rounded-full bg-white/60 px-2.5 py-1 text-xs">{item.capacity} people</span>
                </div>
                <p className="mt-1 text-xs text-stone-600">{item.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-9 grid items-start gap-6 lg:grid-cols-[1fr_360px]" aria-label="Schedule and booking">
          <div className="schedule-panel">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="step-number">02</span>
                <h2 className="text-sm font-semibold">Find your time</h2>
              </div>
              <span className="text-xs text-stone-500">All times UTC</span>
            </div>
            <div className="my-6 flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-medium">
                <span className="sr-only">Booking date (UTC)</span>
                <input aria-label="Booking date (UTC)" type="date" value={date} required onChange={(event) => changeDate(event.target.value)} className="date-input" />
              </label>
              <div className="flex gap-2">
                <button type="button" className="date-button" aria-label="Previous day" onClick={() => shiftDate(-1)}>←</button>
                <button type="button" className="date-button" onClick={() => changeDate(today())}>Today</button>
                <button type="button" className="date-button" aria-label="Next day" onClick={() => shiftDate(1)}>→</button>
              </div>
            </div>
            <div className="mb-4 flex items-center justify-between border-t border-stone-200 pt-5">
              <h3 className="font-medium">{room?.name ?? 'Room'} schedule</h3>
              {!loading && !error && <span className="text-xs text-stone-500">{bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}</span>}
            </div>
            {notice && notice.roomId === roomId && notice.date === date &&
              <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice.message}</p>}
            {editError && <p role="alert" className="error-banner mb-4">{editError}</p>}
            {loading ? <p role="status" className="py-12 text-center text-sm text-stone-500">Loading schedule…</p>
              : error ? <div role="alert" className="error-banner">{error} <button className="underline" onClick={() => setRevision((value) => value + 1)}>Retry</button></div>
                : bookings.length === 0 ? (
                  <div className="empty-schedule">
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-300 text-2xl text-emerald-800" aria-hidden="true">↗</span>
                    <h4 className="font-serif text-2xl">A little breathing room.</h4>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-stone-500">No bookings for this room on this day.<br />Make the first one.</p>
                  </div>
                ) : (
                  <ul className="space-y-3" aria-label="Bookings">
                    {bookings.map((booking) => (
                      <li key={booking.id} className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4">
                        <div className="min-w-14 border-r border-stone-200 pr-4 text-sm">
                          <p className="font-semibold">{timeLabel(booking.startTime)}</p>
                          <p className="mt-1 text-stone-500">{timeLabel(booking.endTime)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="break-words font-medium">{booking.title}</h4>
                          <p className="mt-1 break-words text-sm text-stone-500">{booking.organizer}</p>
                          {booking.notes &&
                            <p className="mt-2 break-words whitespace-pre-line text-sm text-stone-700">{booking.notes}</p>}
                          {(booking.startTime.slice(0, 10) !== date || booking.endTime.slice(0, 10) !== date) &&
                            <p className="mt-2 text-xs text-stone-500">{booking.startTime.slice(0, 10)} → {booking.endTime.slice(0, 10)} · UTC</p>}
                        </div>
                        <button type="button" className="edit-button" aria-label={`Edit ${booking.title}`}
                          aria-pressed={editing?.id === booking.id} onClick={() => startEditing(booking.id)}>Edit</button>
                      </li>
                    ))}
                  </ul>
                )}
          </div>
          {room && <BookingForm key={`${roomId}-${date}-${editing?.id ?? 'new'}`} room={room} date={date} booking={editing}
            onCancel={leaveEditMode}
            onSaved={(booking) => {
              if (editing) {
                leaveEditMode();
                setNotice({ roomId, date, message: `“${booking.title}” updated.` });
              } else {
                setNotice({ roomId: booking.roomId, date: booking.startTime.slice(0, 10), message: `“${booking.title}” booked in ${room.name}.` });
              }
              setRevision((value) => value + 1);
            }} />}
        </section>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-stone-300 pt-5 text-xs text-stone-500">
          <span>Gather · A little space for good work.</span>
          <span>Bookings reset when the server restarts.</span>
        </footer>
      </main>
    </div>
  );
}
