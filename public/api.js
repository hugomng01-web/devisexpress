export async function api(path, data) {
  const response = await fetch('/api/v2/' + path, data === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Service indisponible.'), { status: response.status });
  return result;
}
