import { randomUUID } from 'node:crypto';

export class ValidationError extends Error {
  status = 400;
}

export class NotFoundError extends Error {
  status = 404;
}

export class ConflictError extends Error {
  status = 409;
}

function requireRoom(store, roomId) {
  if (!store.rooms.some((room) => room.id === roomId)) {
    throw new ValidationError('Choose an existing room.');
  }
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new ValidationError('Use UTC timestamps, for example 2030-06-12T09:00:00Z.');
  }
  const date = new Date(value);
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== normalized) {
    throw new ValidationError('Enter a valid date and time.');
  }
  return date.toISOString();
}

export function listBookings(store, roomId, date) {
  requireRoom(store, roomId);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError('Choose a date in YYYY-MM-DD format.');
  }
  const start = parseTimestamp(`${date}T00:00:00Z`);
  const end = new Date(new Date(start).getTime() + 86_400_000).toISOString();
  return store.bookings
    .filter((booking) => booking.roomId === roomId && booking.startTime < end && booking.endTime > start)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

const EDITABLE_FIELDS = ['roomId', 'title', 'organizer', 'startTime', 'endTime', 'notes'];

function requireObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Provide a booking object.');
  }
}

function validateBooking(store, input) {
  requireRoom(store, input.roomId);
  for (const field of ['title', 'organizer']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].trim().length > 100) {
      throw new ValidationError(`${field === 'title' ? 'Title' : 'Organizer'} must contain 1–100 characters.`);
    }
  }
  const startTime = parseTimestamp(input.startTime);
  const endTime = parseTimestamp(input.endTime);
  if (startTime >= endTime) {
    throw new ValidationError('End time must be after start time.');
  }
  const notes = input.notes ?? '';
  if (input.notes === null || typeof notes !== 'string' || notes.trim().length > 1000) {
    throw new ValidationError('Notes must be text of at most 1000 characters.');
  }
  return {
    roomId: input.roomId,
    title: input.title.trim(),
    organizer: input.organizer.trim(),
    startTime,
    endTime,
    notes: notes.trim(),
  };
}

function assertNoOverlap(store, candidate, ignoreId) {
  const conflict = store.bookings.some((booking) => booking.id !== ignoreId
    && booking.roomId === candidate.roomId
    && candidate.startTime < booking.endTime
    && booking.startTime < candidate.endTime);
  if (conflict) throw new ConflictError('This room is already booked at that time.');
}

export function createBooking(store, input) {
  requireObject(input);
  const fields = validateBooking(store, input);
  assertNoOverlap(store, fields);
  const booking = { id: randomUUID(), ...fields };
  store.bookings.push(booking);
  return booking;
}

export function getBooking(store, id) {
  const booking = store.bookings.find((item) => item.id === id);
  if (!booking) throw new NotFoundError('Booking not found.');
  return booking;
}

export function updateBooking(store, id, input) {
  requireObject(input);
  const booking = getBooking(store, id);
  const merged = { ...booking };
  for (const field of EDITABLE_FIELDS) {
    if (Object.hasOwn(input, field)) merged[field] = input[field];
  }
  const fields = validateBooking(store, merged);
  assertNoOverlap(store, fields, id);
  return Object.assign(booking, fields);
}
