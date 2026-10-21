export type UserRole = 'user' | 'admin' | 'super_admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserDevice {
  id: string;
  userId: string;
  fcmToken?: string;
  deviceName: string;
  platform: string;
  browser: string;
  userAgent?: string;
  trusted: boolean;
  revoked: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export type AuthRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface AuthRequestRecord {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
  status: AuthRequestStatus;
  approvedAt?: string;
  rejectedAt?: string;
  approvedByDeviceId?: string;
  rejectedByDeviceId?: string;
}

export interface AdminLogRecord {
  id: string;
  actorUid: string;
  actorRole?: string;
  action: string;
  targetUid?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface HistoricoItem {

  data: string;
  texto: string;
}

export type RecordStatus = 'aberto' | 'em_andamento' | 'aguardando' | 'concluido' | 'cancelado';
export type RecordPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';

export interface ClienteRecord {
  id: number;
  numeroChamado: string;
  nomeCliente: string;
  endereco: string;
  telefone: string;
  email?: string;
  idProjeto?: string;
  idVantive?: string;
  numeroLP?: string;
  equipamento?: string;
  historico: HistoricoItem[];
  status: RecordStatus;
  prioridade: RecordPrioridade;
  dataPrevista?: string;
  observacoes?: string;
  dataCriacao: string;
  ultimaAtualizacao: string;
}

export type TaStatus = 'correlação' | 'encerrado';

export interface TaRecord {
  id: string;
  numeroTa: string;
  definicoes: string;
  dataInicio: string;
  horaInicio: string;
  horaAcionado: string;
  sobressalenteNecessario: boolean;
  numeroChamadoSobressalente?: string;
  suporteAtendente?: string; // NOME SUPORTE
  tecnicoN1Tx?: string;      // TECNICO DE N1 TX
  resolucaoFalha?: string;
  status: TaStatus;
  historicoEdicoes?: string[];
  dataCriacao: string;
  ultimaAtualizacao: string;
}

export interface RotaHL4Item {
  id: string;
  nome: string;
  url: string;
  storagePath: string;
  enviadoEm: string;
  dataUrl?: string;
  tamanho?: string;
  dimensoes?: string;
}

export interface EquipamentoItem {
  id?: number;
  codigo: string;
  referencia: string;
  fabricante: string;
  descricao: string;
  equipamento: string;
  ativo: string;
  searchNormalized?: string;
}

