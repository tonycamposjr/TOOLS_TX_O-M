import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile, UserDevice, AuthRequestRecord, AdminLogRecord, UserRole } from '../types';

interface AdminPanelTabProps {
  currentUserProfile: UserProfile | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function AdminPanelTab({ currentUserProfile, showToast }: AdminPanelTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'usuarios' | 'admins' | 'dispositivos' | 'auth_requests' | 'logs' | 'config'>('dashboard');

  // Firestore Data Collections
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [authRequests, setAuthRequests] = useState<AuthRequestRecord[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Search/Filter states
  const [searchUser, setSearchUser] = useState('');
  const [bootstrapStatus, setBootstrapStatus] = useState<any>(null);

  const SUPER_ADMIN_EMAIL = 'tonicampos1992@icloud.com';

  // Check role authorization
  const isAuthorized = currentUserProfile && (currentUserProfile.role === 'super_admin' || currentUserProfile.role === 'admin');

  // Fetch collections in real-time
  useEffect(() => {
    if (!isAuthorized) return;

    // Users listener
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uList: UserProfile[] = [];
      snap.forEach(d => uList.push({ uid: d.id, ...d.data() } as UserProfile));
      setUsers(uList);
    });

    // Devices listener
    const unsubDevices = onSnapshot(collection(db, 'devices'), (snap) => {
      const dList: UserDevice[] = [];
      snap.forEach(d => dList.push({ id: d.id, ...d.data() } as UserDevice));
      setDevices(dList);
    });

    // AuthRequests listener
    const unsubAuth = onSnapshot(collection(db, 'authRequests'), (snap) => {
      const reqList: AuthRequestRecord[] = [];
      snap.forEach(d => reqList.push({ id: d.id, ...d.data() } as AuthRequestRecord));
      setAuthRequests(reqList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    // Logs listener
    const unsubLogs = onSnapshot(collection(db, 'adminLogs'), (snap) => {
      const logList: AdminLogRecord[] = [];
      snap.forEach(d => logList.push({ id: d.id, ...d.data() } as AdminLogRecord));
      setAdminLogs(logList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubDevices();
      unsubAuth();
      unsubLogs();
    };
  }, [isAuthorized]);

  if (!isAuthorized) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center',
        background: 'var(--surface)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        margin: '20px'
      }}>
        <div style={{ fontSize: '48px', color: '#ef4444', marginBottom: '16px' }}>
          <i className="fas fa-user-lock"></i>
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: '22px' }}>Acesso Restrito ao Painel Administrativo</h2>
        <p style={{ color: 'var(--muted)', maxWidth: '500px', margin: '0 auto 20px' }}>
          Você não possui privilégios de Administrador ou Super Admin para acessar esta seção. Faça login com uma conta autorizada.
        </p>
      </div>
    );
  }

  // Handle set user role via Backend API
  const handleSetUserRole = async (targetUid: string, targetEmail: string, newRole: UserRole) => {
    if (targetEmail === SUPER_ADMIN_EMAIL) {
      showToast('A conta do Super Admin Principal é protegida e não pode ser modificada.', 'error');
      return;
    }

    if (currentUserProfile?.role !== 'super_admin' && (newRole === 'super_admin' || newRole === 'admin')) {
      showToast('Apenas o Super Admin pode atribuir funções administrativas.', 'error');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/set-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUid, newRole })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao alterar função.');
      }

      showToast(`Função do usuário alterada para "${newRole.toUpperCase()}".`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Toggle user block status
  const handleToggleBlockUser = async (targetUid: string, targetEmail: string, currentActive: boolean) => {
    if (targetEmail === SUPER_ADMIN_EMAIL) {
      showToast('O Super Admin Principal não pode ser bloqueado.', 'error');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/toggle-user-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUid, active: !currentActive })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao alterar status.');

      showToast(`Usuário ${!currentActive ? 'desbloqueado' : 'bloqueado'} com sucesso.`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Revoke Device
  const handleRevokeDevice = async (deviceId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/revoke-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ deviceId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao revogar.');

      showToast('Dispositivo revogado com sucesso.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Run Super Admin Bootstrap manually
  const handleRunBootstrap = async () => {
    try {
      const res = await fetch('/api/auth/bootstrap-super-admin', { method: 'POST' });
      const data = await res.json();
      setBootstrapStatus(data);
      if (data.success) {
        showToast(`Bootstrap concluído com sucesso! Custom claim atribuída para ${data.email}.`, 'success');
      } else {
        showToast(`Bootstrap aviso: ${data.reason || data.error}`, 'warning');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchUser.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchUser.toLowerCase())
  );

  return (
    <div className="admin-panel-container" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '16px',
        marginBottom: '24px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fas fa-[#818cf8] fa-user-shield"></i> Painel de Administração / SUPER ADMIN
            </h2>
            <p style={{ margin: '6px 0 0', opacity: 0.8, fontSize: '14px' }}>
              Gestão de usuários, permissões, dispositivos confiáveis, auditoria de segurança e autenticação Push
            </p>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-crown" style={{ color: '#f59e0b' }}></i>
            {currentUserProfile?.role.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Sub Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        marginBottom: '24px',
        paddingBottom: '8px'
      }}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie' },
          { id: 'usuarios', label: 'Usuários', icon: 'fa-users' },
          { id: 'admins', label: 'Administradores', icon: 'fa-user-cog' },
          { id: 'dispositivos', label: 'Dispositivos', icon: 'fa-mobile-alt' },
          { id: 'auth_requests', label: 'Solicitações de Login', icon: 'fa-[#a855f7] fa-key' },
          { id: 'logs', label: 'Logs de Auditoria', icon: 'fa-list-alt' },
          { id: 'config', label: 'Configurações', icon: 'fa-cog' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              border: activeSubTab === tab.id ? '2px solid #6366f1' : '1px solid var(--border)',
              background: activeSubTab === tab.id ? '#6366f1' : 'var(--surface)',
              color: activeSubTab === tab.id ? 'white' : 'var(--text)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap'
            }}
          >
            <i className={`fas ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* --- DASHBOARD TAB --- */}
      {activeSubTab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>TOTAL DE USUÁRIOS</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#6366f1', margin: '8px 0' }}>{users.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Cadastrados na base</div>
          </div>

          <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>SUPER ADMINS & ADMINS</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#f59e0b', margin: '8px 0' }}>
              {users.filter(u => u.role === 'admin' || u.role === 'super_admin').length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Privilégios administrativos</div>
          </div>

          <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>DISPOSITIVOS CADASTRADOS</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#10b981', margin: '8px 0' }}>{devices.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Confiáveis / Ativos</div>
          </div>

          <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>SOLICITAÇÕES DE LOGIN</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#ec4899', margin: '8px 0' }}>{authRequests.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Tentativas de acesso Push</div>
          </div>
        </div>
      )}

      {/* --- USUÁRIOS TAB --- */}
      {activeSubTab === 'usuarios' && (
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..."
              value={searchUser}
              onChange={e => setSearchUser(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                width: '300px'
              }}
            />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)' }}>
                <th style={{ padding: '12px' }}>Usuário</th>
                <th style={{ padding: '12px' }}>E-mail</th>
                <th style={{ padding: '12px' }}>Role</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{u.displayName || 'Sem nome'}</td>
                  <td style={{ padding: '12px' }}>
                    {u.email}
                    {u.email === SUPER_ADMIN_EMAIL && (
                      <span style={{ marginLeft: '8px', background: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>PROPRIETÁRIO</span>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: u.role === 'super_admin' ? '#fef3c7' : u.role === 'admin' ? '#e0e7ff' : '#f1f5f9',
                      color: u.role === 'super_admin' ? '#d97706' : u.role === 'admin' ? '#4f46e5' : '#64748b'
                    }}>
                      {u.role?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      color: u.active !== false ? '#10b981' : '#ef4444',
                      fontWeight: 700
                    }}>
                      {u.active !== false ? 'Ativo' : 'Bloqueado'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {u.email !== SUPER_ADMIN_EMAIL && currentUserProfile?.role === 'super_admin' && (
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {u.role !== 'admin' && (
                          <button 
                            onClick={() => handleSetUserRole(u.uid, u.email, 'admin')}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#4f46e5', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Tornar Admin
                          </button>
                        )}
                        {u.role === 'admin' && (
                          <button 
                            onClick={() => handleSetUserRole(u.uid, u.email, 'user')}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Rebaixar p/ User
                          </button>
                        )}
                        <button 
                          onClick={() => handleToggleBlockUser(u.uid, u.email, u.active !== false)}
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: u.active !== false ? '#ef4444' : '#10b981', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                        >
                          {u.active !== false ? 'Bloquear' : 'Desbloquear'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- ADMINISTRADORES TAB --- */}
      {activeSubTab === 'admins' && (
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px' }}>Administradores do Sistema</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {users.filter(u => u.role === 'admin' || u.role === 'super_admin').map(adm => (
              <div key={adm.uid} style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{adm.displayName || 'Admin'} ({adm.email})</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>UID: {adm.uid}</div>
                </div>
                <span style={{ padding: '4px 12px', borderRadius: '12px', background: adm.role === 'super_admin' ? '#fef3c7' : '#e0e7ff', color: adm.role === 'super_admin' ? '#d97706' : '#4f46e5', fontWeight: 700, fontSize: '12px' }}>
                  {adm.role.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- DISPOSITIVOS TAB --- */}
      {activeSubTab === 'dispositivos' && (
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px' }}>Dispositivos Cadastrados na Rede</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)' }}>
                <th style={{ padding: '10px' }}>Dispositivo</th>
                <th style={{ padding: '10px' }}>User ID</th>
                <th style={{ padding: '10px' }}>Plataforma</th>
                <th style={{ padding: '10px' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(dev => (
                <tr key={dev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', fontWeight: 600 }}>{dev.deviceName}</td>
                  <td style={{ padding: '10px' }}>{dev.userId}</td>
                  <td style={{ padding: '10px' }}>{dev.platform} / {dev.browser}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ color: dev.revoked ? '#ef4444' : dev.trusted ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                      {dev.revoked ? 'REVOGADO' : dev.trusted ? 'CONFIÁVEL' : 'PENDENTE'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {!dev.revoked && (
                      <button 
                        onClick={() => handleRevokeDevice(dev.id)}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ef4444', color: '#ef4444', background: 'none', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- SOLICITAÇÕES DE LOGIN TAB --- */}
      {activeSubTab === 'auth_requests' && (
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px' }}>Histórico de Solicitações Push (authRequests)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {authRequests.map(req => (
              <div key={req.id} style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {req.deviceName} ({req.platform} / {req.browser})
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                    User ID: {req.userId} | Data: {new Date(req.createdAt).toLocaleString('pt-BR')}
                  </div>
                </div>

                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '12px',
                  background: req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                  color: req.status === 'approved' ? '#16a34a' : req.status === 'rejected' ? '#dc2626' : '#d97706'
                }}>
                  {req.status?.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- LOGS TAB --- */}
      {activeSubTab === 'logs' && (
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px' }}>Logs de Auditoria Administrativa (adminLogs)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {adminLogs.map(log => (
              <div key={log.id} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span style={{ color: '#6366f1' }}>{log.action}</span>
                  <span style={{ color: 'var(--muted)' }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                </div>
                <div style={{ marginTop: '4px', color: 'var(--muted)' }}>
                  Ator: {log.actorUid} ({log.actorRole || 'admin'}) | Alvo: {log.targetUid || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- CONFIG TAB --- */}
      {activeSubTab === 'config' && (
        <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px' }}>Configurações do Super Admin</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '20px' }}>
            Proprietário do Sistema: <strong>{SUPER_ADMIN_EMAIL}</strong>
          </p>

          <button
            onClick={handleRunBootstrap}
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              background: '#4f46e5',
              color: 'white',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Executar Bootstrap do Super Admin
          </button>

          {bootstrapStatus && (
            <pre style={{ marginTop: '20px', padding: '14px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '12px', overflowX: 'auto' }}>
              {JSON.stringify(bootstrapStatus, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
