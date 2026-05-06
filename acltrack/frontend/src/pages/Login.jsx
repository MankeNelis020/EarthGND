import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, setUser, getToken } from '../api';

const styles = `
  .login-bg {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0f1a;
    padding: 20px;
  }
  .login-card {
    background: #141c2e;
    border: 1px solid #1e293b;
    border-radius: 16px;
    padding: 48px 40px;
    width: 100%;
    max-width: 420px;
  }
  .login-title {
    font-family: 'DM Serif Display', serif;
    font-size: 2rem;
    color: #00d4aa;
    margin-bottom: 4px;
  }
  .login-subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 36px; }
  .form-group { margin-bottom: 20px; }
  .form-label {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .form-input {
    width: 100%;
    padding: 12px 14px;
    background: #0a0f1a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 0.95rem;
    font-family: 'DM Sans', sans-serif;
    transition: border-color 0.15s;
    outline: none;
  }
  .form-input:focus { border-color: #00d4aa; }
  .btn-primary {
    width: 100%;
    padding: 13px;
    background: #00d4aa;
    color: #0a0f1a;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
    font-family: 'DM Sans', sans-serif;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .error-msg {
    background: #450a0a;
    border: 1px solid #7f1d1d;
    color: #fca5a5;
    padding: 12px;
    border-radius: 8px;
    font-size: 0.85rem;
    margin-bottom: 20px;
  }
`;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    navigate('/');
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(email, wachtwoord);
      setToken(data.token);
      setUser(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{styles}</style>
      <div className="login-bg">
        <div className="login-card">
          <h1 className="login-title">ACLTrack</h1>
          <p className="login-subtitle">ACL Revalidatie Portaal — Fysiotherapie</p>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">E-mailadres</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="naam@praktijk.nl"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Wachtwoord</label>
              <input
                className="form-input"
                type="password"
                value={wachtwoord}
                onChange={e => setWachtwoord(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Inloggen...' : 'Inloggen'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
