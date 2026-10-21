import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin App
let adminApp;
if (!getApps().length) {
  try {
    adminApp = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId
    });
    console.log('[Server] Firebase Admin SDK inicializado com sucesso');
  } catch (err) {
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log('[Server] Firebase Admin SDK inicializado em modo fallback');
  }
} else {
  adminApp = getApps()[0];
}

const authAdmin = getAuth(adminApp);
const db = getFirestore(adminApp);
const messagingAdmin = getMessaging(adminApp);

// Use the custom database ID if specified
try {
  db.settings({
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-sistemaunificado-e92457df-f5f5-4dae-bf01-2d93c76dd572',
    ignoreUndefinedProperties: true
  });
} catch (e) {
  console.log('[Server] Firestore database ID configurado');
}

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'tonicampos1992@icloud.com';

// Bootstrap Super Admin
export async function bootstrapSuperAdmin() {
  console.log(`[Bootstrap] Verificando Super Admin para e-mail: ${SUPER_ADMIN_EMAIL}`);
  try {
    const userRecord = await authAdmin.getUserByEmail(SUPER_ADMIN_EMAIL);
    const uid = userRecord.uid;
    console.log(`[Bootstrap] Usuário encontrado no Firebase Authentication com UID: ${uid}`);

    // Set custom user claim
    await authAdmin.setCustomUserClaims(uid, { role: 'super_admin' });
    console.log(`[Bootstrap] Custom claim { role: 'super_admin' } configurada para UID: ${uid}`);

    // Update / Create Firestore User Document
    const userRef = db.collection('users').doc(uid);
    await userRef.set({
      uid,
      email: SUPER_ADMIN_EMAIL,
      displayName: userRecord.displayName || 'Super Admin',
      role: 'super_admin',
      active: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Record audit log
    await db.collection('adminLogs').add({
      actorUid: uid,
      actorRole: 'super_admin',
      action: 'BOOTSTRAP_SUPER_ADMIN',
      targetUid: uid,
      timestamp: new Date().toISOString(),
      metadata: { email: SUPER_ADMIN_EMAIL, status: 'success' }
    });

    console.log(`[Bootstrap] Documento do Super Admin atualizado com sucesso no Firestore.`);
    return { success: true, uid, email: SUPER_ADMIN_EMAIL };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.warn(`[Bootstrap] AVISO: A conta ${SUPER_ADMIN_EMAIL} ainda NÃO foi criada no Firebase Authentication.`);
      console.warn(`[Bootstrap] Crie a conta manualmente pelo app para aplicar automaticamente o papel de super_admin.`);
      return { success: false, reason: 'user_not_found', email: SUPER_ADMIN_EMAIL };
    } else {
      console.error('[Bootstrap] Erro ao executar bootstrap do Super Admin:', error);
      return { success: false, error: error.message };
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Execute bootstrap on startup
  bootstrapSuperAdmin().catch(console.error);

  // Helper middleware to verify Firebase ID Token
  const authenticateUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorização não fornecido' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await authAdmin.verifyIdToken(token);
      (req as any).user = decodedToken;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
  };

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', superAdminEmail: SUPER_ADMIN_EMAIL });
  });

  // Explicit Trigger for Super Admin Bootstrap
  app.post('/api/auth/bootstrap-super-admin', async (req, res) => {
    const result = await bootstrapSuperAdmin();
    res.json(result);
  });

  // Send Email Validation Code (OTP)
  app.post('/api/auth/send-email-code', async (req, res) => {
    const { uid, email } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ error: 'uid e email são obrigatórios' });
    }

    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      await db.collection('emailVerificationCodes').doc(uid).set({
        uid,
        email,
        code,
        createdAt: new Date().toISOString(),
        expiresAt,
        verified: false
      });

      console.log(`=======================================================`);
      console.log(`[EMAIL OTP] CÓDIGO DE VALIDAÇÃO GERADO PARA: ${email}`);
      console.log(`[EMAIL OTP] CÓDIGO: ${code} (Válido por 10 minutos)`);
      console.log(`=======================================================`);

      res.json({
        success: true,
        message: `Código de validação enviado para o e-mail ${email}`,
        email,
        expiresAt,
        devCode: code // Returned for testing & dev convenience
      });
    } catch (error: any) {
      console.error('[EMAIL OTP] Erro ao enviar código por e-mail:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify Email Validation Code (OTP)
  app.post('/api/auth/verify-email-code', async (req, res) => {
    const { uid, code } = req.body;

    if (!uid || !code) {
      return res.status(400).json({ error: 'uid e code são obrigatórios' });
    }

    try {
      const docRef = db.collection('emailVerificationCodes').doc(uid);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(400).json({ success: false, error: 'Nenhum código de validação pendente encontrado. Solicite um novo código.' });
      }

      const data = docSnap.data()!;

      if (new Date(data.expiresAt) < new Date()) {
        return res.status(400).json({ success: false, error: 'Código de validação expirado. Solicite um novo código.' });
      }

      if (data.code.trim() !== String(code).trim()) {
        return res.status(400).json({ success: false, error: 'Código de validação incorreto. Verifique o e-mail e tente novamente.' });
      }

      // Mark as verified
      await docRef.update({
        verified: true,
        verifiedAt: new Date().toISOString()
      });

      // Update user doc
      await db.collection('users').doc(uid).set({
        emailVerifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      res.json({
        success: true,
        message: 'Código de validação confirmado com sucesso!'
      });
    } catch (error: any) {
      console.error('[EMAIL OTP] Erro ao verificar código:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify Current User Token & Claims
  app.get('/api/auth/me', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    try {
      const userRecord = await authAdmin.getUser(user.uid);
      res.json({
        uid: user.uid,
        email: user.email,
        customClaims: userRecord.customClaims || {},
        role: userRecord.customClaims?.role || 'user'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Send Push Notification for Login Approval to Trusted Devices
  app.post('/api/auth/send-push', async (req, res) => {
    const { targetUserId, requestId, deviceName, platform, browser } = req.body;

    if (!targetUserId || !requestId) {
      return res.status(400).json({ error: 'targetUserId e requestId são obrigatórios' });
    }

    try {
      // Find trusted active devices for this user
      const devicesSnap = await db.collection('devices')
        .where('userId', '==', targetUserId)
        .where('trusted', '==', true)
        .where('revoked', '==', false)
        .get();

      const tokens: string[] = [];
      devicesSnap.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken) {
          tokens.push(data.fcmToken);
        }
      });

      if (tokens.length === 0) {
        return res.json({ success: false, message: 'Nenhum dispositivo confiável encontrado com token FCM ativo.' });
      }

      // Send Push via FCM
      const message = {
        notification: {
          title: 'NOVA TENTATIVA DE LOGIN',
          body: `Tentativa de acesso em ${deviceName || 'Dispositivo'} (${platform || ''} / ${browser || ''}). Toque para aprovar ou recusar.`
        },
        data: {
          requestId,
          type: 'AUTH_REQUEST',
          deviceName: deviceName || '',
          platform: platform || '',
          browser: browser || ''
        },
        tokens
      };

      const response = await messagingAdmin.sendEachForMulticast(message);
      console.log(`[FCM Push] Enviado para ${response.successCount} dispositivos confiáveis de ${targetUserId}`);

      res.json({
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      });
    } catch (error: any) {
      console.error('[FCM Push] Erro ao enviar notificação:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Set User Role (Admin / Super Admin ONLY)
  app.post('/api/admin/set-role', authenticateUser, async (req, res) => {
    const caller = (req as any).user;
    const { targetUid, newRole } = req.body;

    if (!targetUid || !['user', 'admin', 'super_admin'].includes(newRole)) {
      return res.status(400).json({ error: 'targetUid e newRole válidos são obrigatórios' });
    }

    try {
      const callerRecord = await authAdmin.getUser(caller.uid);
      const callerRole = callerRecord.customClaims?.role || 'user';

      if (callerRole !== 'super_admin' && callerRole !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem alterar funções.' });
      }

      const targetRecord = await authAdmin.getUser(targetUid);
      const targetEmail = targetRecord.email;

      // Protection Rule: SUPER_ADMIN account cannot have role altered or downgraded
      if (targetEmail === SUPER_ADMIN_EMAIL && newRole !== 'super_admin') {
        return res.status(403).json({ error: 'A conta do Super Admin Principal não pode ser rebaixada ou alterada.' });
      }

      // Protection Rule: Only Super Admin can promote to or manage super_admin / admin roles
      if (callerRole !== 'super_admin' && (newRole === 'super_admin' || newRole === 'admin')) {
        return res.status(403).json({ error: 'Apenas o Super Admin pode conceder privilégios de Administrador ou Super Admin.' });
      }

      // Apply Custom Claim
      await authAdmin.setCustomUserClaims(targetUid, { role: newRole });

      // Update Firestore user document
      await db.collection('users').doc(targetUid).set({
        role: newRole,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Audit Log
      await db.collection('adminLogs').add({
        actorUid: caller.uid,
        actorRole: callerRole,
        action: 'ROLE_CHANGED',
        targetUid,
        timestamp: new Date().toISOString(),
        metadata: { targetEmail, newRole }
      });

      res.json({ success: true, targetUid, newRole });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle Active Status / Block User
  app.post('/api/admin/toggle-user-status', authenticateUser, async (req, res) => {
    const caller = (req as any).user;
    const { targetUid, active } = req.body;

    try {
      const callerRecord = await authAdmin.getUser(caller.uid);
      const callerRole = callerRecord.customClaims?.role || 'user';

      if (callerRole !== 'super_admin' && callerRole !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const targetRecord = await authAdmin.getUser(targetUid);
      if (targetRecord.email === SUPER_ADMIN_EMAIL) {
        return res.status(403).json({ error: 'A conta do Super Admin Principal não pode ser bloqueada ou desativada.' });
      }

      // Update Firebase Auth disabled state
      await authAdmin.updateUser(targetUid, { disabled: !active });

      // Update Firestore
      await db.collection('users').doc(targetUid).set({
        active,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Log action
      await db.collection('adminLogs').add({
        actorUid: caller.uid,
        actorRole: callerRole,
        action: active ? 'USER_UNBLOCKED' : 'USER_BLOCKED',
        targetUid,
        timestamp: new Date().toISOString(),
        metadata: { targetEmail: targetRecord.email }
      });

      res.json({ success: true, targetUid, active });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List All Users (Admin endpoint)
  app.get('/api/admin/users', authenticateUser, async (req, res) => {
    const caller = (req as any).user;
    try {
      const callerRecord = await authAdmin.getUser(caller.uid);
      const callerRole = callerRecord.customClaims?.role || 'user';
      if (callerRole !== 'super_admin' && callerRole !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const usersSnap = await db.collection('users').get();
      const users: any[] = [];
      usersSnap.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
      });

      res.json({ users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List Audit Logs
  app.get('/api/admin/logs', authenticateUser, async (req, res) => {
    const caller = (req as any).user;
    try {
      const callerRecord = await authAdmin.getUser(caller.uid);
      const callerRole = callerRecord.customClaims?.role || 'user';
      if (callerRole !== 'super_admin' && callerRole !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const logsSnap = await db.collection('adminLogs').orderBy('timestamp', 'desc').limit(100).get();
      const logs: any[] = [];
      logsSnap.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() });
      });

      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Revoke Device
  app.post('/api/admin/revoke-device', authenticateUser, async (req, res) => {
    const caller = (req as any).user;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId é obrigatório' });
    }

    try {
      const deviceRef = db.collection('devices').doc(deviceId);
      const deviceDoc = await deviceRef.get();

      if (!deviceDoc.exists) {
        return res.status(404).json({ error: 'Dispositivo não encontrado' });
      }

      const deviceData = deviceDoc.data()!;
      if (deviceData.userId !== caller.uid) {
        // Check if admin
        const callerRecord = await authAdmin.getUser(caller.uid);
        const callerRole = callerRecord.customClaims?.role || 'user';
        if (callerRole !== 'super_admin' && callerRole !== 'admin') {
          return res.status(403).json({ error: 'Você só pode revogar seus próprios dispositivos.' });
        }
      }

      await deviceRef.update({
        trusted: false,
        revoked: true,
        lastSeenAt: new Date().toISOString()
      });

      await db.collection('adminLogs').add({
        actorUid: caller.uid,
        action: 'DEVICE_REVOKED',
        targetUid: deviceData.userId,
        timestamp: new Date().toISOString(),
        metadata: { deviceId, deviceName: deviceData.deviceName }
      });

      res.json({ success: true, deviceId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE MIDDLEWARE OR STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Rodando na porta ${PORT}`);
  });
}

startServer();
