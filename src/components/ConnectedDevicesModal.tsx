import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db, getDeviceId } from '../lib/firebase';
import { UserDevice } from '../types';

interface ConnectedDevicesModalProps {
  currentUserId: string;
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ConnectedDevicesModal({ currentUserId, onClose, showToast }: ConnectedDevicesModalProps) {
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const currentDeviceId = getDeviceId();

  useEffect(() => {
    if (!currentUserId) return;

    const q = query(
      collection(db, 'devices'),
      where('userId', '==', currentUserId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const devList: UserDevice[] = [];
      snapshot.forEach((docSnap) => {
        devList.push({ id: docSnap.id, ...docSnap.data() } as UserDevice);
      });
      setDevices(devList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  const handleRevokeDevice = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Tem certeza que deseja revogar o acesso do dispositivo "${deviceName}"?`)) {
      return;
    }

    try {
      await setDoc(doc(db, 'devices', deviceId), {
        trusted: false,
        revoked: true,
        lastSeenAt: new Date().toISOString()
      }, { merge: true });

      showToast(`Acesso do dispositivo "${deviceName}" revogado com sucesso.`, 'success');
    } catch (err) {
      console.error('Erro ao revogar dispositivo:', err);
      showToast('Erro ao revogar dispositivo.', 'error');
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 11000,
      padding: '20px'
    }}>
      <div className="modal-card" style={{
        background: 'var(--surface, #ffffff)',
        color: 'var(--text, #1e293b)',
        borderRadius: '16px',
        maxWidth: '650px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        border: '1px solid var(--border, #e2e8f0)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          background: 'var(--surface-subtle, #f8fafc)',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-desktop" style={{ color: '#6366f1' }}></i> Dispositivos Conectados
          </h3>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)' }}
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)' }}>
            Gerencie os dispositivos registrados e autorizados a acessar sua conta. Dispositivos revogados não poderão aprovar novas solicitações.
          </p>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>Carregando dispositivos...</div>
          ) : devices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>Nenhum dispositivo registrado.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {devices.map((device) => {
                const isCurrent = device.id === currentDeviceId;
                return (
                  <div 
                    key={device.id}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid var(--border, #e2e8f0)',
                      background: device.revoked ? 'var(--surface-subtle)' : isCurrent ? 'rgba(99, 102, 241, 0.05)' : 'var(--surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        background: device.revoked ? '#fee2e2' : device.trusted ? '#dcfce7' : '#fef3c7',
                        color: device.revoked ? '#ef4444' : device.trusted ? '#16a34a' : '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px'
                      }}>
                        <i className={`fas ${device.platform === 'Android' || device.platform === 'iOS' ? 'fa-mobile-alt' : 'fa-laptop'}`}></i>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {device.deviceName || 'Dispositivo Desconhecido'}
                          {isCurrent && (
                            <span style={{
                              background: '#6366f1',
                              color: 'white',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontWeight: 600
                            }}>ESTE DISPOSITIVO</span>
                          )}
                          {device.revoked && (
                            <span style={{
                              background: '#ef4444',
                              color: 'white',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontWeight: 600
                            }}>REVOGADO</span>
                          )}
                        </div>

                        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                          Plataforma: {device.platform} | Navegador: {device.browser}
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          Último acesso: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('pt-BR') : 'N/A'}
                        </div>
                      </div>
                    </div>

                    {!device.revoked && (
                      <button
                        onClick={() => handleRevokeDevice(device.id, device.deviceName)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid #ef4444',
                          background: 'none',
                          color: '#ef4444',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <i className="fas fa-ban"></i> REVOGAR
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
