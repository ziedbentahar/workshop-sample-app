export async function api(path, options) {
  const response = await fetch(`/api${path}`, options);
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete the request.');
  return body;
}
