import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';
import { db, getDeviceId } from '../lib/firebase';
import { AuthRequestRecord, UserDevice } from '../types';

interface ApprovalNotificationModalProps {
  currentUserId: string;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ApprovalNotificationModal({ currentUserId, showToast }: ApprovalNotificationModalProps) {
  const [activeRequests, setActiveRequests] = useState<AuthRequestRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Listen for active pending authRequests for current user
  useEffect(() => {
    if (!currentUserId) return;

    const q = query(
      collection(db, 'authRequests'),
      where('userId', '==', currentUserId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests: AuthRequestRecord[] = [];
      const now = new Date();

      snapshot.forEach((documentDoc) => {
        const data = documentDoc.data() as AuthRequestRecord;
        // Filter out expired requests
        if (data.expiresAt && new Date(data.expiresAt) > now) {
          requests.push({ ...data, id: documentDoc.id });
        }
      });

      setActiveRequests(requests);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  if (activeRequests.length === 0) return null;

  const currentReq = activeRequests[0];
  const currentDeviceId = getDeviceId();

  const handleDecision = async (decision: 'approve' | 'reject') => {
    setIsProcessing(true);
    try {
      const reqRef = doc(db, 'authRequests', currentReq.id);
      const reqSnap = await getDoc(reqRef);

      if (!reqSnap.exists()) {
        showToast('Solicitação de login não encontrada.', 'error');
        setIsProcessing(false);
        return;
      }

      const reqData = reqSnap.data() as AuthRequestRecord;
      if (reqData.status !== 'pending') {
        showToast('Esta solicitação já foi processada ou expirou.', 'warning');
        setIsProcessing(false);
        return;
      }

      const nowIso = new Date().toISOString();

      if (decision === 'approve') {
        await setDoc(reqRef, {
          status: 'approved',
          approvedAt: nowIso,
          approvedByDeviceId: currentDeviceId,
          approvedByUserId: currentUserId
        }, { merge: true });

        showToast('Acesso APROVADO com sucesso!', 'success');
      } else {
        await setDoc(reqRef, {
          status: 'rejected',
          rejectedAt: nowIso,
          rejectedByDeviceId: currentDeviceId
        }, { merge: true });

        showToast('Acesso RECUSADO. A tentativa de login foi bloqueada.', 'info');
      }
    } catch (err) {
      console.error('Erro ao responder solicitação de login:', err);
      showToast('Erro ao processar resposta. Tente novamente.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 12000,
      padding: '20px'
    }}>
      <div className="modal-card" style={{
        background: 'var(--surface, #ffffff)',
        color: 'var(--text, #1e293b)',
        borderRadius: '20px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '2px solid #6366f1',
        overflow: 'hidden',
        animation: 'bounceIn 0.4s ease'
      }}>
        {/* Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
          color: 'white',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '36px',
            marginBottom: '8px'
          }}>
            <i className="fas fa-shield-virus"></i>
          </div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '0.5px' }}>
            NOVA TENTATIVA DE LOGIN
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.9 }}>
            Foi detectada uma tentativa de acesso à sua conta.
          </p>
        </div>

        {/* Content Details */}
        <div style={{ padding: '24px' }}>
          <div style={{
            background: 'var(--surface-subtle, #f8fafc)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Dispositivo:</span>
              <strong style={{ color: 'var(--text)' }}>{currentReq.deviceName || 'Navegador Web'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Navegador:</span>
              <span>{currentReq.browser || 'Desconhecido'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Sistema:</span>
              <span>{currentReq.platform || 'Desconhecido'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Data e Hora:</span>
              <span>{new Date(currentReq.createdAt).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '16px', marginBottom: '20px' }}>
            Você reconhece este acesso?
          </div>

          {/* Decision Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => handleDecision('reject')}
              disabled={isProcessing}
              style={{
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #ef4444',
                background: '#fef2f2',
                color: '#dc2626',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <i className="fas fa-times-circle"></i> RECUSAR
            </button>

            <button
              onClick={() => handleDecision('approve')}
              disabled={isProcessing}
              style={{
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <i className="fas fa-check-circle"></i> PERMITIR ACESSO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
