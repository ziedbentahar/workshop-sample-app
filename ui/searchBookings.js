export const timeLabel = (value) => value.slice(11, 16);

export function filterBookings(bookings, query) {
  const term = String(query ?? '').trim().toLowerCase();
  if (!term) return bookings;
  return bookings.filter((booking) =>
    `${booking.title} ${booking.organizer} ${timeLabel(booking.startTime)} ${timeLabel(booking.endTime)}`
      .toLowerCase().includes(term));
}
