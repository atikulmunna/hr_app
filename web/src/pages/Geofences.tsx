import { useCallback, useEffect, useState } from 'react';
import { Geofence, api } from '../api';
import { errorMessage } from '../lib/errors';

export function Geofences({ token }: { token: string }) {
  const [items, setItems] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.geofences(token));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (fence: Geofence) => {
    setBusyId(fence.id);
    setError(null);
    try {
      await api.setGeofenceActive(token, fence.id, !fence.active);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="section-head">
        <h2>Geofences</h2>
        <button className="btn primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New geofence'}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {creating && (
        <NewGeofenceForm
          token={token}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
          onError={setError}
        />
      )}

      {loading && <p className="muted">Loading...</p>}
      {!loading && items.length === 0 && (
        <p className="muted">No geofences yet.</p>
      )}

      <div className="list">
        {items.map((g) => (
          <article className="card row" key={g.id}>
            <div className="grow">
              <div className="row-title">
                <span className={`pill ${g.active ? 'active' : 'retired'}`}>
                  {g.active ? 'active' : 'inactive'}
                </span>
                <span className="notif-title">{g.name}</span>
              </div>
              <div className="muted small">
                {g.latitude.toFixed(5)}, {g.longitude.toFixed(5)} - radius{' '}
                {g.radiusM} m
              </div>
            </div>
            <div className="actions">
              <button
                className="btn"
                disabled={busyId === g.id}
                onClick={() => void toggle(g)}
              >
                {g.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NewGeofenceForm({
  token,
  onCreated,
  onError,
}: {
  token: string;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusM, setRadiusM] = useState('200');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const radius = Number(radiusM);
    if (!name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      onError('Name, latitude, and longitude are required.');
      return;
    }
    if (Number.isNaN(radius) || radius <= 0) {
      onError('Radius must be greater than zero.');
      return;
    }
    setBusy(true);
    try {
      await api.createGeofence(token, {
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        radiusM: radius,
      });
      onCreated();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Latitude</label>
          <input
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="23.72750"
          />
        </div>
        <div className="field">
          <label>Longitude</label>
          <input
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="90.39000"
          />
        </div>
        <div className="field">
          <label>Radius (m)</label>
          <input value={radiusM} onChange={(e) => setRadiusM(e.target.value)} />
        </div>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create geofence
        </button>
      </div>
    </div>
  );
}
