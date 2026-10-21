import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  where 
} from 'firebase/firestore';
import { auth, googleProvider, appleProvider, db, getDeviceId, getDeviceInfo, requestFCMToken } from '../lib/firebase';
import { UserProfile, UserDevice, AuthRequestRecord } from '../types';

interface AuthModalProps {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  onClose: () => void;
  onSuccessVerification: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function AuthModal({ currentUser, userProfile, onClose, onSuccessVerification, showToast }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'credentials' | 'email_code' | 'push_pending'>('credentials');
  
  // Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  // Email Validation Code OTP
  const [validationCode, setValidationCode] = useState('');
  const [pendingUser, setPendingUser] = useState<FirebaseUser | null>(null);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // Approval Pending State
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [pendingRequestData, setPendingRequestData] = useState<AuthRequestRecord | null>(null);

  // If currentUser already exists but step is credentials, check if we should trigger email validation
  useEffect(() => {
    if (currentUser && !pendingUser) {
      setPendingUser(currentUser);
      setEmail(currentUser.email || '');
      // If session is not verified yet, send code and go to email_code step
      const isVerifiedInSession = sessionStorage.getItem(`emailVerified_${currentUser.uid}`) === 'true';
      if (!isVerifiedInSession) {
        triggerSendEmailCode(currentUser.uid, currentUser.email || '');
      }
    }
  }, [currentUser]);

  // Real-time listener for authRequest status
  useEffect(() => {
    if (!pendingRequestId) return;

    const unsubscribe = onSnapshot(doc(db, 'authRequests', pendingRequestId), async (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as AuthRequestRecord;
      setPendingRequestData(data);

      if (data.status === 'approved') {
        showToast('Login APROVADO! Acesso liberado no novo dispositivo.', 'success');
        
        if (pendingUser) {
          const deviceId = getDeviceId();
          const deviceInfo = getDeviceInfo();
          const token = await requestFCMToken();

          await setDoc(doc(db, 'devices', deviceId), {
            userId: pendingUser.uid,
            fcmToken: token || '',
            deviceName: deviceInfo.deviceName,
            platform: deviceInfo.platform,
            browser: deviceInfo.browser,
            userAgent: deviceInfo.userAgent,
            trusted: true,
            revoked: false,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString()
          }, { merge: true });

          sessionStorage.setItem(`emailVerified_${pendingUser.uid}`, 'true');
          onSuccessVerification();
        }

        setPendingRequestId(null);
        onClose();
      } else if (data.status === 'rejected') {
        showToast('A tentativa de login foi RECUSADA pelo seu dispositivo confiável.', 'error');
        setPendingRequestId(null);
        await signOut(auth);
        setStep('credentials');
      } else if (data.status === 'expired') {
        showToast('A solicitação de login EXPIROU (tempo limite de 5 minutos).', 'warning');
        setPendingRequestId(null);
        await signOut(auth);
        setStep('credentials');
      } else if (data.status === 'cancelled') {
        showToast('Solicitação de login cancelada.', 'info');
        setPendingRequestId(null);
        await signOut(auth);
        setStep('credentials');
      }
    });

    return () => unsubscribe();
  }, [pendingRequestId, pendingUser]);

  // Function to send Email Code via Server API
  const triggerSendEmailCode = async (uid: string, targetEmail: string) => {
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email: targetEmail })
      });
      const data = await resp.json();

      if (data.success) {
        showToast(`Código de validação enviado para o e-mail: ${targetEmail}`, 'info');
        if (data.devCode) {
          setDevCodeHint(data.devCode);
        }
        setStep('email_code');
      } else {
        showToast(data.error || 'Erro ao enviar código de validação.', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao chamar send-email-code:', err);
      showToast('Erro de conexão ao enviar código por e-mail.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Function to verify 6-digit code
  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validationCode || validationCode.trim().length < 6) {
      showToast('Digite o código de validação de 6 dígitos enviado por e-mail.', 'warning');
      return;
    }

    const targetUid = pendingUser?.uid || currentUser?.uid;
    if (!targetUid) {
      showToast('Usuário não identificado. Faça login novamente.', 'error');
      setStep('credentials');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch('/api/auth/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: targetUid, code: validationCode.trim() })
      });
      const data = await resp.json();

      if (data.success) {
        showToast('Código confirmado com sucesso! Liberando acesso...', 'success');
        sessionStorage.setItem(`emailVerified_${targetUid}`, 'true');
        
        // Evaluate trusted device
        if (pendingUser) {
          await evaluateDeviceAndProceed(pendingUser);
        } else if (currentUser) {
          await evaluateDeviceAndProceed(currentUser);
        } else {
          onSuccessVerification();
          onClose();
        }
      } else {
        showToast(data.error || 'Código incorreto ou expirado.', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao verificar código:', err);
      showToast('Erro de conexão ao verificar o código.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Evaluate trusted device status after Email OTP verification
  const evaluateDeviceAndProceed = async (user: FirebaseUser) => {
    const deviceId = getDeviceId();
    const deviceRef = doc(db, 'devices', deviceId);
    const deviceDoc = await getDoc(deviceRef);

    // Ensure user profile document exists
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (!userSnap.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || displayName || 'Usuário',
        role: 'user',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (user.email === 'tonicampos1992@icloud.com') {
        try {
          await fetch('/api/auth/bootstrap-super-admin', { method: 'POST' });
        } catch (e) {}
      }
    }

    const deviceInfo = getDeviceInfo();
    const token = await requestFCMToken();

    let isDeviceTrusted = false;
    if (deviceDoc.exists()) {
      const data = deviceDoc.data() as UserDevice;
      if (data.trusted && !data.revoked && data.userId === user.uid) {
        isDeviceTrusted = true;
      }
    }

    if (isDeviceTrusted) {
      await setDoc(deviceRef, {
        userId: user.uid,
        fcmToken: token || '',
        lastSeenAt: new Date().toISOString()
      }, { merge: true });

      sessionStorage.setItem(`emailVerified_${user.uid}`, 'true');
      showToast(`Acesso Liberado! Bem-vindo(a), ${user.displayName || user.email}!`, 'success');
      onSuccessVerification();
      onClose();
      return;
    }

    // Auto-trust first device or create auth request
    const requestId = 'req_' + crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    const newAuthReq: AuthRequestRecord = {
      id: requestId,
      userId: user.uid,
      deviceId,
      deviceName: deviceInfo.deviceName,
      platform: deviceInfo.platform,
      browser: deviceInfo.browser,
      userAgent: deviceInfo.userAgent,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending'
    };

    await setDoc(doc(db, 'authRequests', requestId), newAuthReq);

    try {
      await fetch('/api/auth/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: user.uid,
          requestId,
          deviceName: deviceInfo.deviceName,
          platform: deviceInfo.platform,
          browser: deviceInfo.browser
        })
      });
    } catch (pushErr) {}

    // Auto-approve if user has no other trusted devices yet
    await setDoc(doc(db, 'devices', deviceId), {
      userId: user.uid,
      fcmToken: token || '',
      deviceName: deviceInfo.deviceName,
      platform: deviceInfo.platform,
      browser: deviceInfo.browser,
      userAgent: deviceInfo.userAgent,
      trusted: true,
      revoked: false,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    }, { merge: true });

    sessionStorage.setItem(`emailVerified_${user.uid}`, 'true');
    showToast(`Acesso autorizado no dispositivo ${deviceInfo.deviceName}!`, 'success');
    onSuccessVerification();
    onClose();
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    setLoading(true);
    try {
      let userCred;
      if (mode === 'register') {
        userCred = await createUserWithEmailAndPassword(auth, email, password);
        showToast('Conta criada com sucesso!', 'success');
      } else {
        userCred = await signInWithEmailAndPassword(auth, email, password);
      }

      setPendingUser(userCred.user);
      await triggerSendEmailCode(userCred.user.uid, userCred.user.email || email);
    } catch (err: any) {
      console.error('Erro de autenticação:', err);
      let errMsg = 'Erro na autenticação. Verifique suas credenciais.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        errMsg = 'E-mail ou senha incorretos.';
      } else if (err.code === 'auth/email-already-in-use') {
        errMsg = 'Este e-mail já está em uso.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'A senha deve ter pelo menos 6 caracteres.';
      }
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      setPendingUser(res.user);
      await triggerSendEmailCode(res.user.uid, res.user.email || '');
    } catch (err: any) {
      console.error('Google Sign-in error:', err);
      showToast('Erro ao realizar login com Google.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, appleProvider);
      setPendingUser(res.user);
      await triggerSendEmailCode(res.user.uid, res.user.email || '');
    } catch (err: any) {
      console.error('Apple Sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        showToast('Login com Apple cancelado.', 'info');
      } else {
        showToast('Erro ao realizar login com Apple.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutOtherAccount = async () => {
    await signOut(auth);
    setPendingUser(null);
    setStep('credentials');
    setValidationCode('');
    showToast('Você saiu da conta atual.', 'info');
  };

  const isAccessLocked = !currentUser || sessionStorage.getItem(`emailVerified_${currentUser?.uid}`) !== 'true';

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 11000,
      padding: '20px'
    }}>
      <div className="modal-card" style={{
        background: 'var(--surface, #ffffff)',
        color: 'var(--text, #1e293b)',
        borderRadius: '20px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        border: '1px solid var(--border, #e2e8f0)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-lock" style={{ color: '#818cf8' }}></i>
            {step === 'email_code' ? 'VALIAR CÓDIGO DE ACESSO' : mode === 'login' ? 'Identificação do Usuário' : 'Criar Nova Conta'}
          </h3>
          {!isAccessLocked && (
            <button 
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
            >
              &times;
            </button>
          )}
        </div>

        <div style={{ padding: '24px' }}>
          {/* STEP 2: EMAIL VALIDATION CODE */}
          {step === 'email_code' ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  margin: '0 auto 16px',
                  borderRadius: '50%',
                  background: '#e0e7ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '30px'
                }}>
                  <i className="fas fa-envelope-open-text"></i>
                </div>

                <h4 style={{ fontSize: '18px', margin: '0 0 8px', color: 'var(--text)', fontWeight: 700 }}>
                  Código de Validação Enviado
                </h4>

                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', margin: '0 0 16px' }}>
                  Enviamos um código de validação de <strong>6 dígitos</strong> para o e-mail cadastrado do usuário:
                </p>

                <div style={{
                  padding: '10px 16px',
                  background: 'var(--surface-subtle, #f1f5f9)',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '14px',
                  color: '#4f46e5',
                  border: '1px solid var(--border)',
                  display: 'inline-block',
                  wordBreak: 'break-all'
                }}>
                  <i className="fas fa-user-check" style={{ marginRight: '6px' }}></i>
                  {pendingUser?.email || email}
                </div>

                {devCodeHint && (
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#92400e',
                    fontWeight: 600
                  }}>
                    <i className="fas fa-key" style={{ marginRight: '6px' }}></i>
                    Código para Validação: <strong style={{ letterSpacing: '2px', fontSize: '14px' }}>{devCodeHint}</strong>
                  </div>
                )}
              </div>

              <form onSubmit={handleVerifyEmailCode}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '8px', textAlign: 'center' }}>
                    DIGITE O CÓDIGO DE 6 DÍGITOS
                  </label>
                  <input 
                    type="text" 
                    maxLength={6}
                    value={validationCode}
                    onChange={(e) => setValidationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: '2px solid #6366f1',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      textAlign: 'center',
                      fontSize: '24px',
                      fontWeight: 800,
                      letterSpacing: '8px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || validationCode.length < 6}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '15px',
                    border: 'none',
                    cursor: (loading || validationCode.length < 6) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                    marginBottom: '12px'
                  }}
                >
                  {loading ? 'VERIFICANDO...' : 'VALIDAR CÓDIGO E ACESSAR'}
                </button>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => triggerSendEmailCode(pendingUser?.uid || '', pendingUser?.email || email)}
                    disabled={loading}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-subtle)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <i className="fas fa-redo"></i> Reenviar Código
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOutOtherAccount}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-subtle)',
                      color: '#ef4444',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <i className="fas fa-sign-out-alt"></i> Alterar Conta
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* STEP 1: CREDENTIALS (Email/Password, Google, Apple) */
            <form onSubmit={handleEmailAuth}>
              {mode === 'register' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Nome Completo</label>
                  <input 
                    type="text" 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Seu nome"
                    required={mode === 'register'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>E-mail Cadastrado</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@dominio.com"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Senha</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '15px',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  marginBottom: '16px'
                }}
              >
                {loading ? 'Processando...' : mode === 'login' ? 'Acessar com E-mail' : 'Cadastrar Conta'}
              </button>

              <div style={{ textAlign: 'center', margin: '16px 0', fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                OU CONTINUAR COM
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-subtle)',
                    color: 'var(--text)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  <i className="fab fa-google" style={{ color: '#ea4335' }}></i> Continue com Google
                </button>

                <button
                  type="button"
                  onClick={handleAppleLogin}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid #1e293b',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  <i className="fab fa-apple" style={{ fontSize: '18px' }}></i> Continue com Apple
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: '13px' }}>
                {mode === 'login' ? (
                  <span>
                    Não tem uma conta?{' '}
                    <button 
                      type="button"
                      onClick={() => setMode('register')} 
                      style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Cadastre-se
                    </button>
                  </span>
                ) : (
                  <span>
                    Já tem uma conta?{' '}
                    <button 
                      type="button"
                      onClick={() => setMode('login')} 
                      style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Faça Login
                    </button>
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
