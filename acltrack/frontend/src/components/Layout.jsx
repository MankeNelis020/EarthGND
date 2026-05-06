import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { clearToken, getUser } from '../api';

const styles = `
  .layout { display: flex; min-height: 100vh; }

  .sidebar {
    width: 240px;
    background: #0d1526;
    border-right: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 10;
  }

  .sidebar-logo {
    padding: 24px 20px 20px;
    border-bottom: 1px solid #1e293b;
  }

  .sidebar-logo h1 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.5rem;
    color: #00d4aa;
    letter-spacing: -0.5px;
  }

  .sidebar-logo p {
    font-size: 0.7rem;
    color: #64748b;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .sidebar-nav { flex: 1; padding: 16px 12px; }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.15s;
    margin-bottom: 4px;
  }

  .nav-link:hover { background: #1e293b; color: #e2e8f0; }
  .nav-link.active { background: #00d4aa18; color: #00d4aa; }
  .nav-link .icon { font-size: 1.1rem; width: 20px; text-align: center; }

  .sidebar-footer {
    padding: 16px;
    border-top: 1px solid #1e293b;
  }

  .user-info { margin-bottom: 10px; }
  .user-info .name { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
  .user-info .role { font-size: 0.75rem; color: #64748b; }

  .logout-btn {
    width: 100%;
    padding: 8px;
    background: transparent;
    border: 1px solid #1e293b;
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.15s;
  }
  .logout-btn:hover { border-color: #ef4444; color: #ef4444; }

  .main-content {
    margin-left: 240px;
    flex: 1;
    padding: 32px;
    min-height: 100vh;
  }

  @media (max-width: 768px) {
    .sidebar { width: 100%; position: relative; height: auto; }
    .main-content { margin-left: 0; }
    .layout { flex-direction: column; }
  }
`;

export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  const rolLabel = user?.rol === 'admin' ? 'Beheerder' : 'Fysiotherapeut';

  return (
    <>
      <style>{styles}</style>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <h1>ACLTrack</h1>
            <p>Revalidatie portaal</p>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" end className={({isActive}) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="icon">⊞</span> Dashboard
            </NavLink>
            <NavLink to="/patienten" className={({isActive}) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="icon">♟</span> Patiënten
            </NavLink>
            <NavLink to="/statistieken" className={({isActive}) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="icon">◈</span> Statistieken
            </NavLink>
            {user?.rol === 'admin' && (
              <NavLink to="/beheer" className={({isActive}) => `nav-link${isActive ? ' active' : ''}`}>
                <span className="icon">⚙</span> Beheer
              </NavLink>
            )}
          </nav>
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="name">{user?.naam || 'Gebruiker'}</div>
              <div className="role">{rolLabel}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout}>Uitloggen</button>
          </div>
        </aside>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
