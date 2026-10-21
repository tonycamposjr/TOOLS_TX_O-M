import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile } from './types';

import CarimboTab from './components/CarimboTab';
import CalculadoraTab from './components/CalculadoraTab';
import TabelaTab from './components/TabelaTab';
import NsapTab from './components/NsapTab';
import ClientesTab from './components/ClientesTab';
import DatacomTab from './components/DatacomTab';
import TaTab from './components/TaTab';
import RotasHl4Tab from './components/RotasHl4Tab';
import OtdrTab from './components/OtdrTab';
import EquipamentosTab from './components/EquipamentosTab';
import KmlMapTab from './components/KmlMapTab';
import AdminPanelTab from './components/AdminPanelTab';

import AuthModal from './components/AuthModal';
import ConnectedDevicesModal from './components/ConnectedDevicesModal';
import ApprovalNotificationModal from './components/ApprovalNotificationModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSkeuomorphic, setIsSkeuomorphic] = useState<boolean>(false);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSessionVerified, setIsSessionVerified] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDevicesModal, setShowDevicesModal] = useState(false);

  // Custom Toast notification state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  // Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Check if user session has verified email code
        const verifiedInSession = sessionStorage.getItem(`emailVerified_${user.uid}`) === 'true';
        setIsSessionVerified(verifiedInSession);

        // Fetch custom claims to refresh role
        try {
          const idTokenResult = await user.getIdTokenResult(true);
          const claimRole = idTokenResult.claims.role as any;

          // Listen to user document in Firestore
          const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserProfile;
              setUserProfile({
                ...data,
                role: claimRole || data.role || 'user'
              });
            } else {
              setUserProfile({
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'Usuário',
                role: claimRole || 'user',
                active: true
              });
            }
          });

          return () => unsubProfile();
        } catch (e) {
          console.warn('Erro ao obter custom claims:', e);
        }
      } else {
        setUserProfile(null);
        setIsSessionVerified(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Initialize and apply theme and active tab from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);

    const savedSkeuo = localStorage.getItem('skeuomorphism') === 'true';
    setIsSkeuomorphic(savedSkeuo);
    if (savedSkeuo) {
      document.documentElement.classList.add('skeuomorphic-mode');
    } else {
      document.documentElement.classList.remove('skeuomorphic-mode');
    }

    const savedTab = localStorage.getItem('lastActiveTab') || 'dashboard';
    setActiveTab(savedTab);
  }, []);

  // Update theme and persist
  const handleToggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    showToast(`Tema alterado para ${newTheme === 'dark' ? 'escuro' : 'claro'}`, 'success');
  };

  // Toggle Skeuomorphism mode
  const handleToggleSkeuomorphism = () => {
    const nextVal = !isSkeuomorphic;
    setIsSkeuomorphic(nextVal);
    localStorage.setItem('skeuomorphism', String(nextVal));
    if (nextVal) {
      document.documentElement.classList.add('skeuomorphic-mode');
      showToast('Design Skeuomórfico ativado!', 'success');
    } else {
      document.documentElement.classList.remove('skeuomorphic-mode');
      showToast('Design Skeuomórfico desativado.', 'info');
    }
  };

  // Update active tab and persist
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    localStorage.setItem('lastActiveTab', tabId);
  };

  // Get localized tool name for breadcrumb
  const getTabName = (tabId: string) => {
    switch (tabId) {
      case 'carimbo': return 'Carimbo de Fibras';
      case 'calculadora': return 'Calculadora Óptica';
      case 'tabela': return 'Tabela de Atenuação';
      case 'nsap': return 'Conversor NSAP';
      case 'datacom': return 'Script Datacom';
      case 'clientes': return 'Registros de Campo';
      case 'ta': return 'Controle de TA';
      case 'rotas_hl4': return 'Rotas HL4';
      case 'otdr': return 'Analisador OTDR (.SOR)';
      case 'equipamentos': return 'Consulta de Equipamentos';
      case 'kml': return 'Mapa KML & Navegação Google Maps';
      case 'admin': return 'Painel de Administração / Super Admin';
      default: return '';
    }
  };

  // Toast Dispatcher
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToast({ message, type });
  };

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Global actions
  const handleResetAll = () => {
    if (confirm('Tem certeza que deseja resetar todas as ferramentas? Isso limpará todos os dados não salvos e o histórico de clientes do banco local.')) {
      localStorage.clear();
      showToast('Todas as configurações e registros locais foram resetados.', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  const handleExportAll = () => {
    const dbRecords = localStorage.getItem('clientesEquipamentosDB');
    const calcConfig = localStorage.getItem('calcConfig');
    
    const allData = {
      clientesEquipamentos: dbRecords ? JSON.parse(dbRecords) : [],
      calculadoraConfig: calcConfig ? JSON.parse(calcConfig) : null,
      theme: theme,
      exportDate: new Date().toISOString(),
      version: '3.1'
    };

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_sistema_rede_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Backup completo do sistema exportado!', 'success');
  };

  const handleSignOut = async () => {
    if (currentUser) {
      sessionStorage.removeItem(`emailVerified_${currentUser.uid}`);
    }
    setIsSessionVerified(false);
    await signOut(auth);
    showToast('Você saiu do sistema.', 'info');
  };

  const isAdminOrSuperAdmin = userProfile && (userProfile.role === 'admin' || userProfile.role === 'super_admin');

  return (
    <div className={`app-container ${activeTab === 'kml' ? 'kml-mode-active' : ''}`}>
      {/* Header */}
      <div className="app-header">
        <div className="app-title">
          <i className="fas fa-network-wired"></i> Sistema Unificado de Ferramentas de Rede
          <div className="version-badge">v3.1</div>
        </div>
        
        {/* Controls Bar */}
        <div className="controls-bar" style={{ flexWrap: 'wrap' }}>
          {/* USER AUTH SECTION */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-subtle, #f1f5f9)', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {userProfile?.displayName || currentUser.email}
              </span>

              {userProfile?.role && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 700,
                  background: userProfile.role === 'super_admin' ? '#f59e0b' : userProfile.role === 'admin' ? '#6366f1' : '#10b981',
                  color: 'white'
                }}>
                  {userProfile.role.toUpperCase()}
                </span>
              )}

              <button 
                onClick={() => setShowDevicesModal(true)}
                title="Dispositivos Conectados"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: '14px', padding: '4px' }}
              >
                <i className="fas fa-desktop"></i>
              </button>

              <button 
                onClick={handleSignOut}
                title="Sair"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '4px' }}
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-shield-alt"></i> Acessar Conta
            </button>
          )}

          {isAdminOrSuperAdmin && (
            <button
              onClick={() => handleTabChange('admin')}
              style={{
                background: activeTab === 'admin' ? '#f59e0b' : 'var(--surface-subtle)',
                color: activeTab === 'admin' ? 'white' : 'var(--text)',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-user-shield" style={{ color: '#f59e0b' }}></i> Painel Admin
            </button>
          )}

          <button className="theme-toggle" onClick={handleToggleTheme} aria-label="Alternar tema claro/escuro">
            <i className={theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon'}></i>
          </button>
          <button 
            className={`skeuo-toggle-btn ${isSkeuomorphic ? 'active' : ''}`} 
            onClick={handleToggleSkeuomorphism}
            title="Alternar modo Skeuomórfico (Efeito Físico 3D)"
          >
            <i className="fas fa-cube"></i> {isSkeuomorphic ? 'Skeuomorfismo ON' : 'Skeuomorfismo'}
          </button>
          <button className="export-btn" onClick={handleExportAll} aria-label="Exportar todos os dados">
            <i className="fas fa-file-export"></i> Exportar
          </button>
          <button className="reset-btn" onClick={handleResetAll} aria-label="Resetar todas as ferramentas">
            <i className="fas fa-redo"></i> Resetar
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'dashboard' ? (
        <div className="dashboard-container">
          <div className="dashboard-intro">
            <h2>Painel de Ferramentas de Rede</h2>
            <p>Selecione um dos utilitários integrados para iniciar suas operações e gerenciar as atividades de campo.</p>
          </div>
          
          <div className="dashboard-grid">
            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#6366F1', '--tool-color-rgb': '99, 102, 241' } as React.CSSProperties}
              onClick={() => handleTabChange('carimbo')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-stamp"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Carimbo de Fibras</div>
                <div className="dashboard-card-desc">Gerador padronizado de carimbos de fibra óptica e vistorias para ativação e registros de redes.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#F97316', '--tool-color-rgb': '249, 115, 22' } as React.CSSProperties}
              onClick={() => handleTabChange('calculadora')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-calculator"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Calculadora Óptica</div>
                <div className="dashboard-card-desc">Análise completa de orçamento de potência, atenuações, margens de segurança e viabilidade física de enlaces.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#14B8A6', '--tool-color-rgb': '20, 184, 166' } as React.CSSProperties}
              onClick={() => handleTabChange('tabela')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-table"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Tabela de Atenuação</div>
                <div className="dashboard-card-desc">Referência técnica rápida para atenuações teóricas por km e perdas típicas recomendadas para elementos de rede.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#06B6D4', '--tool-color-rgb': '6, 182, 212' } as React.CSSProperties}
              onClick={() => handleTabChange('nsap')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-code-branch"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Conversor NSAP</div>
                <div className="dashboard-card-desc">Conversor bidirecional avançado entre endereços NSAP e endereçamento IP estruturado para roteamento.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#10B981', '--tool-color-rgb': '16, 185, 129' } as React.CSSProperties}
              onClick={() => handleTabChange('datacom')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-terminal"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Script Datacom</div>
                <div className="dashboard-card-desc">Automatizador e gerador de templates CLI para provisionamento de VLANs, rate-limits e portas em switches Datacom.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#EC4899', '--tool-color-rgb': '236, 72, 153' } as React.CSSProperties}
              onClick={() => handleTabChange('clientes')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-clipboard-list"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Registros de Campo</div>
                <div className="dashboard-card-desc">Centralizador e gerenciador local de chamados, ordens de serviço, vistorias de equipamentos e histórico.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#8B5CF6', '--tool-color-rgb': '139, 92, 246' } as React.CSSProperties}
              onClick={() => handleTabChange('ta')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-file-signature"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Controle de TA</div>
                <div className="dashboard-card-desc">Gerenciador de termos de atendimento, definições de enlace, ativações de campo e uso de sobressalentes.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#3B82F6', '--tool-color-rgb': '59, 130, 246' } as React.CSSProperties}
              onClick={() => handleTabChange('rotas_hl4')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-map-marked-alt"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Rotas HL4</div>
                <div className="dashboard-card-desc">Gerenciamento e visualização de mapas e rotas HL4 em formato PNG.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#2563EB', '--tool-color-rgb': '37, 99, 235' } as React.CSSProperties}
              onClick={() => handleTabChange('otdr')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-chart-line"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Analisador OTDR (.SOR)</div>
                <div className="dashboard-card-desc">Leitura de arquivos Telcordia SR-4731, gráficos de atenuação, relatórios e certificação de fibra óptica.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#059669', '--tool-color-rgb': '5, 150, 105' } as React.CSSProperties}
              onClick={() => handleTabChange('equipamentos')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-boxes"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Consulta de Equipamentos</div>
                <div className="dashboard-card-desc">Catálogo IndexedDB de ~21.600 itens de telecom, busca por código/ref/descrição e filtros.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            <div 
              className="dashboard-card" 
              style={{ '--tool-color': '#10b981', '--tool-color-rgb': '16, 185, 129' } as React.CSSProperties}
              onClick={() => handleTabChange('kml')}
            >
              <div className="dashboard-card-glow"></div>
              <div className="dashboard-card-top">
                <div className="dashboard-card-header">
                  <div className="dashboard-card-icon">
                    <i className="fas fa-map-marked-alt"></i>
                  </div>
                </div>
                <div className="dashboard-card-title">Mapa KML & Navegação Maps</div>
                <div className="dashboard-card-desc">Envio de arquivos .KML, visualização de pontos geográficos no mapa e rota de navegação direta para o App Google Maps.</div>
              </div>
              <div className="dashboard-card-footer">
                Acessar <i className="fas fa-arrow-right"></i>
              </div>
            </div>

            {isAdminOrSuperAdmin && (
              <div 
                className="dashboard-card" 
                style={{ '--tool-color': '#f59e0b', '--tool-color-rgb': '245, 158, 11' } as React.CSSProperties}
                onClick={() => handleTabChange('admin')}
              >
                <div className="dashboard-card-glow"></div>
                <div className="dashboard-card-top">
                  <div className="dashboard-card-header">
                    <div className="dashboard-card-icon">
                      <i className="fas fa-user-shield"></i>
                    </div>
                  </div>
                  <div className="dashboard-card-title">Painel de Administração / Super Admin</div>
                  <div className="dashboard-card-desc">Gestão de usuários, custom claims, permissões, dispositivos e logs de auditoria do sistema.</div>
                </div>
                <div className="dashboard-card-footer">
                  Acessar Painel <i className="fas fa-arrow-right"></i>
                </div>
              </div>
            )}

          </div>
        </div>
      ) : (
        <>
          {/* Breadcrumb & Navigation */}
          <div className="back-to-dashboard-container">
            <button className="back-to-dashboard-btn" onClick={() => handleTabChange('dashboard')}>
              <i className="fas fa-arrow-left"></i> Voltar ao Painel
            </button>
            <div style={{ marginLeft: '12px', fontSize: '14px', color: 'var(--muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-chevron-right" style={{ fontSize: '11px', color: 'var(--border)' }}></i>
              <span>{getTabName(activeTab)}</span>
            </div>
          </div>

          {/* Active Panel View */}
          <div className="tab-panels">
            {activeTab === 'carimbo' && <CarimboTab showToast={showToast} />}
            {activeTab === 'calculadora' && <CalculadoraTab showToast={showToast} />}
            {activeTab === 'tabela' && <TabelaTab />}
            {activeTab === 'nsap' && <NsapTab showToast={showToast} />}
            {activeTab === 'datacom' && <DatacomTab showToast={showToast} />}
            {activeTab === 'clientes' && <ClientesTab showToast={showToast} />}
            {activeTab === 'ta' && <TaTab showToast={showToast} />}
            {activeTab === 'rotas_hl4' && <RotasHl4Tab showToast={showToast} />}
            {activeTab === 'otdr' && <OtdrTab showToast={showToast} />}
            {activeTab === 'equipamentos' && <EquipamentosTab showToast={showToast} />}
            {activeTab === 'kml' && <KmlMapTab showToast={showToast} />}
            {activeTab === 'admin' && <AdminPanelTab currentUserProfile={userProfile} showToast={showToast} />}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="app-footer">
        <p>Sistema Unificado de Ferramentas de Rede v3.1 | Autenticação Push & Admin</p>
      </div>

      {/* Auth Modals */}
      {(showAuthModal || !currentUser || !isSessionVerified) && (
        <AuthModal
          currentUser={currentUser}
          userProfile={userProfile}
          onClose={() => setShowAuthModal(false)}
          onSuccessVerification={() => setIsSessionVerified(true)}
          showToast={showToast}
        />
      )}

      {showDevicesModal && currentUser && (
        <ConnectedDevicesModal
          currentUserId={currentUser.uid}
          onClose={() => setShowDevicesModal(false)}
          showToast={showToast}
        />
      )}

      {currentUser && (
        <ApprovalNotificationModal
          currentUserId={currentUser.uid}
          showToast={showToast}
        />
      )}

      {/* Toast Notification element */}
      {toast && (
        <div 
          className="toast"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: toast.type === 'success' ? 'var(--success)' : toast.type === 'error' ? 'var(--err)' : toast.type === 'warning' ? 'var(--warning)' : 'var(--accent)',
            color: 'white',
            padding: '15px 25px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 25px rgba(0,0,0,0.2)',
            zIndex: 10000,
            animation: 'slideInRight 0.3s ease'
          }}
        >
          <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : toast.type === 'error' ? 'fa-exclamation-circle' : toast.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}`}></i>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
