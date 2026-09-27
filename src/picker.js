// The visualiser picker: a <select> populated from the registry that
// remembers the user's last choice.

const STORAGE_KEY = 'sound-visualiser:visualiser';

function loadSavedId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage can be blocked (private mode, site data disabled)
  }
}

function saveId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not critical — the choice just won't survive a reload.
  }
}

function validateRegistry(visualisers) {
  if (visualisers.length === 0) throw new Error('No visualisers registered in visualisers/index.js');
  const seen = new Set();
  for (const V of visualisers) {
    if (!V.id || !V.label) throw new Error(`Visualiser ${V.name} needs a static id and label`);
    if (seen.has(V.id)) throw new Error(`Duplicate visualiser id "${V.id}"`);
    seen.add(V.id);
  }
}

/**
 * Fills `select` with the registered visualisers and calls `onChange(VisualiserClass)`
 * whenever the user picks one. Returns the initially selected class.
 */
export function setUpPicker(select, visualisers, onChange) {
  validateRegistry(visualisers);

  for (const V of visualisers) {
    select.add(new Option(V.label, V.id));
  }

  const byId = id => visualisers.find(V => V.id === id);
  const initial = byId(loadSavedId()) ?? visualisers[0];
  select.value = initial.id;

  select.addEventListener('change', () => {
    const selected = byId(select.value);
    saveId(selected.id);
    onChange(selected);
  });

  return initial;
}
