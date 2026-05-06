import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken, getUser } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patienten from './pages/Patienten';
import PatientDetail from './pages/PatientDetail';
import NieuwPatient from './pages/NieuwPatient';
import Statistieken from './pages/Statistieken';
import Beheer from './pages/Beheer';

function RequireAuth({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const user = getUser();
  if (!user || user.rol !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="patienten" element={<Patienten />} />
          <Route path="patienten/nieuw" element={<NieuwPatient />} />
          <Route path="patienten/:id" element={<PatientDetail />} />
          <Route path="statistieken" element={<Statistieken />} />
          <Route path="beheer" element={<RequireAdmin><Beheer /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
