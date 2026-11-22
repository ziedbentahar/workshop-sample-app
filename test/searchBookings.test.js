import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterBookings, timeLabel } from '../ui/searchBookings.js';
import { createBooking, listBookings } from '../src/bookings.js';
import { createStore } from '../src/store.js';

const bookings = [
  { id: '1', roomId: 'cedar', title: 'Product brainstorm', organizer: 'Alex Morgan',
    startTime: '2030-06-12T09:00:00.000Z', endTime: '2030-06-12T10:00:00.000Z' },
  { id: '2', roomId: 'cedar', title: 'Design review', organizer: 'Sam Rivera',
    startTime: '2030-06-12T14:30:00.000Z', endTime: '2030-06-12T15:15:00.000Z' },
  { id: '3', roomId: 'cedar', title: 'Weekly sync', organizer: 'Priya Shah',
    startTime: '2030-06-12T16:00:00.000Z', endTime: '2030-06-12T17:00:00.000Z' },
];
const ids = (list) => list.map((booking) => booking.id);

test('timeLabel returns the HH:MM part of a UTC timestamp', () => {
  assert.equal(timeLabel('2030-06-12T09:05:00.000Z'), '09:05');
});

for (const query of ['', '   ', undefined, null]) {
  test(`an empty query (${JSON.stringify(query)}) returns every booking unchanged`, () => {
    assert.equal(filterBookings(bookings, query), bookings);
  });
}

test('matches by title, case-insensitively', () => {
  assert.deepEqual(ids(filterBookings(bookings, 'DESIGN')), ['2']);
  assert.deepEqual(ids(filterBookings(bookings, 'brain')), ['1']);
});

test('matches by organizer', () => {
  assert.deepEqual(ids(filterBookings(bookings, 'priya')), ['3']);
});

test('matches by start or end time', () => {
  assert.deepEqual(ids(filterBookings(bookings, '14:30')), ['2']);
  assert.deepEqual(ids(filterBookings(bookings, '15:15')), ['2']);
  assert.deepEqual(ids(filterBookings(bookings, '10:00')), ['1']);
});

test('trims surrounding whitespace from the query', () => {
  assert.deepEqual(ids(filterBookings(bookings, '  sync  ')), ['3']);
});

test('returns several matches in their original order', () => {
  assert.deepEqual(ids(filterBookings(bookings, 'r')), ['1', '2', '3']);
  assert.deepEqual(ids(filterBookings(bookings, ':00')), ['1', '3']);
});

test('returns an empty list when nothing matches', () => {
  assert.deepEqual(filterBookings(bookings, 'retro'), []);
  assert.deepEqual(filterBookings([], 'design'), []);
});

test('does not match on fields outside the meeting details', () => {
  assert.deepEqual(filterBookings(bookings, 'cedar'), []);
  assert.deepEqual(filterBookings(bookings, '2030-06-12'), []);
});

test('treats regex characters in the query literally', () => {
  assert.deepEqual(filterBookings(bookings, '.*'), []);
  const special = [{ ...bookings[0], title: 'Q&A (all hands) [v2]' }];
  assert.deepEqual(ids(filterBookings(special, '(all hands)')), ['1']);
});

test('does not mutate the input list', () => {
  const copy = structuredClone(bookings);
  filterBookings(bookings, 'design');
  assert.deepEqual(bookings, copy);
});

test('filters bookings returned by the booking service', () => {
  const store = createStore();
  const base = { roomId: 'cedar', startTime: '2030-06-12T09:00:00Z', endTime: '2030-06-12T10:00:00Z' };
  const standup = createBooking(store, { ...base, title: 'Standup', organizer: 'Alex Morgan' });
  createBooking(store, { ...base, title: 'Retro', organizer: 'Sam Rivera',
    startTime: '2030-06-12T11:00:00Z', endTime: '2030-06-12T12:00:00Z' });
  const listed = listBookings(store, 'cedar', '2030-06-12');
  assert.deepEqual(filterBookings(listed, 'alex'), [standup]);
  assert.equal(filterBookings(listed, '11:00')[0].title, 'Retro');
});
