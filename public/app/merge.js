const records = ['devis', 'prestations', 'modeles'];
const ordered = value => {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  return value;
};
export const equal = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

export function mergeWorkspace(base, local, remote) {
  const conflicts = [];
  function choose(before, edited, latest, label) {
    if (equal(edited, latest) || equal(latest, before)) return edited;
    if (equal(edited, before)) return latest;
    conflicts.push(label);
    return latest;
  }
  const merged = { ...remote };
  const fields = new Set([...Object.keys(base.profil), ...Object.keys(local.profil), ...Object.keys(remote.profil)]);
  merged.profil = Object.fromEntries([...fields].map(key => [
    key, key === 'prochainNumero'
      ? Math.max(Number(local.profil[key]) || 1, Number(remote.profil[key]) || 1)
      : choose(base.profil[key], local.profil[key], remote.profil[key], 'Fiche entreprise / ' + key),
  ]));
  for (const section of records) {
    const index = snapshot => new Map(snapshot[section].map(record => [record.id, record]));
    const original = index(base), edited = index(local), latest = index(remote);
    const ids = new Set([...latest.keys(), ...edited.keys(), ...original.keys()]);
    merged[section] = [...ids].map(id => choose(original.get(id), edited.get(id), latest.get(id), section + ' / ' + id)).filter(Boolean);
  }
  merged.devis.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const numbers = new Set();
  for (const quote of merged.devis) {
    if (quote.numero && numbers.has(quote.numero)) conflicts.push('Numéro de devis utilisé deux fois : ' + quote.numero);
    if (quote.numero) numbers.add(quote.numero);
  }
  return { merged, conflicts };
}
