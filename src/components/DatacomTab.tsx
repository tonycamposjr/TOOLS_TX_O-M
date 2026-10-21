import React, { useState, useEffect, useRef } from 'react';

interface DatacomTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function DatacomTab({ showToast }: DatacomTabProps) {
  // --- STATE FOR CORE FIELDS ---
  const [hostname, setHostname] = useState('');
  const [model, setModel] = useState('DM2104');
  const [totalPorts, setTotalPorts] = useState(8);
  const [uplinkPort, setUplinkPort] = useState('1/1');
  const [svcPort, setSvcPort] = useState('1/5');

  // --- VLAN GERÊNCIA ---
  const [vlanGer, setVlanGer] = useState('');
  const [vlanGerName, setVlanGerName] = useState('');
  const [ipGer, setIpGer] = useState('');
  const [maskGer, setMaskGer] = useState('');
  const [gw, setGw] = useState('');

  // --- VLAN SERVIÇO ---
  const [vlanSvc, setVlanSvc] = useState('');
  const [vlanSvcName, setVlanSvcName] = useState('');

  // --- INTERFACES ---
  const [descUplink, setDescUplink] = useState('');
  const [descSvc, setDescSvc] = useState('');

  // --- RATE-LIMITING ---
  const [symmetric, setSymmetric] = useState(false);
  const [rlIn, setRlIn] = useState('');
  const [rlOut, setRlOut] = useState('');
  const [autoBurst, setAutoBurst] = useState(false);
  const [burstIn, setBurstIn] = useState('512');
  const [burstOut, setBurstOut] = useState('512');
  const [conversionFactor, setConversionFactor] = useState<1024 | 1000>(1024);
  const [burstPercent, setBurstPercent] = useState<number>(10);

  // --- CREDENCIAIS & SNMP ---
  const [user1, setUser1] = useState('');
  const [user1Hash, setUser1Hash] = useState('');
  const [user2, setUser2] = useState('');
  const [user2Hash, setUser2Hash] = useState('');
  const [snmpRo1, setSnmpRo1] = useState('GESTION');
  const [snmpRo2, setSnmpRo2] = useState('SMART');
  const [snmpRo3, setSnmpRo3] = useState('701hHg61');
  const [snmpRo4, setSnmpRo4] = useState('g3rd@tSWT');
  const [snmpRw, setSnmpRw] = useState('G34@T@c5M');
  
  // Dynamic host lists
  const [snmpHosts, setSnmpHosts] = useState<string[]>([
    '187.100.227.70', '187.100.21.193', '200.204.1.89', '200.204.1.91'
  ]);
  const [syslogHosts, setSyslogHosts] = useState<string[]>([
    '200.153.1.138', '200.204.1.106', '187.100.227.70', '187.100.221.193'
  ]);

  const [sntp1, setSntp1] = useState('200.204.1.103');
  const [sntp2, setSntp2] = useState('200.204.1.104');

  // --- E1 / TDM ---
  const [hasE1, setHasE1] = useState(false);
  const [e1SourceIp, setE1SourceIp] = useState('');
  const [e1DestIp, setE1DestIp] = useState('');
  const [e1PwVlan, setE1PwVlan] = useState('');
  const [e1PwPriority, setE1PwPriority] = useState('7');
  const [e1TdmStart, setE1TdmStart] = useState('1/1');
  const [e1TdmEnd, setE1TdmEnd] = useState('1/2');
  const [e1BundleInterface, setE1BundleInterface] = useState('1/1');
  const [e1CircuitName, setE1CircuitName] = useState('');
  const [e1JitterBuffer, setE1JitterBuffer] = useState('20.000');
  const [e1PacketDelay, setE1PacketDelay] = useState('2.000');
  const [e1VlanName, setE1VlanName] = useState('VLAN_E1');

  // --- SECTION COLLAPSE STATES ---
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({
    0: false, // Identificação
    1: false, // VLAN Gerência
    2: false, // VLAN Serviço
    3: false, // Interfaces
    4: false, // Rate-limiting
    5: false, // Credenciais & SNMP
    6: false, // E1 / TDM
  });

  // --- UI & GENERATION STATES ---
  const [errors, setErrors] = useState<string[]>([]);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [restoreBannerVisible, setRestoreBannerVisible] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  // --- RESTORE PREVIOUS SESSION ---
  useEffect(() => {
    const saved = localStorage.getItem('datacom_cfg_v2');
    if (saved) {
      setRestoreBannerVisible(true);
    }
  }, []);

  const loadPreviousSession = () => {
    const saved = localStorage.getItem('datacom_cfg_v2');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.hostname !== undefined) setHostname(data.hostname);
        if (data.model !== undefined) setModel(data.model);
        if (data.totalPorts !== undefined) setTotalPorts(Number(data.totalPorts));
        if (data.uplinkPort !== undefined) setUplinkPort(data.uplinkPort);
        if (data.svcPort !== undefined) setSvcPort(data.svcPort);
        
        if (data.vlanGer !== undefined) setVlanGer(data.vlanGer);
        if (data.vlanGerName !== undefined) setVlanGerName(data.vlanGerName);
        if (data.ipGer !== undefined) setIpGer(data.ipGer);
        if (data.maskGer !== undefined) setMaskGer(data.maskGer);
        if (data.gw !== undefined) setGw(data.gw);
        
        if (data.vlanSvc !== undefined) setVlanSvc(data.vlanSvc);
        if (data.vlanSvcName !== undefined) setVlanSvcName(data.vlanSvcName);
        
        if (data.descUplink !== undefined) setDescUplink(data.descUplink);
        if (data.descSvc !== undefined) setDescSvc(data.descSvc);
        
        if (data.symmetric !== undefined) setSymmetric(data.symmetric);
        if (data.rlIn !== undefined) setRlIn(data.rlIn);
        if (data.rlOut !== undefined) setRlOut(data.rlOut);
        if (data.autoBurst !== undefined) setAutoBurst(data.autoBurst);
        if (data.burstIn !== undefined) setBurstIn(data.burstIn);
        if (data.burstOut !== undefined) setBurstOut(data.burstOut);
        if (data.conversionFactor !== undefined) setConversionFactor(data.conversionFactor);
        if (data.burstPercent !== undefined) setBurstPercent(Number(data.burstPercent));
        
        if (data.user1 !== undefined) setUser1(data.user1);
        if (data.user1Hash !== undefined) setUser1Hash(data.user1Hash);
        if (data.user2 !== undefined) setUser2(data.user2);
        if (data.user2Hash !== undefined) setUser2Hash(data.user2Hash);
        if (data.snmpRo1 !== undefined) setSnmpRo1(data.snmpRo1);
        if (data.snmpRo2 !== undefined) setSnmpRo2(data.snmpRo2);
        if (data.snmpRo3 !== undefined) setSnmpRo3(data.snmpRo3);
        if (data.snmpRo4 !== undefined) setSnmpRo4(data.snmpRo4);
        if (data.snmpRw !== undefined) setSnmpRw(data.snmpRw);
        
        if (data.snmpHosts !== undefined) setSnmpHosts(data.snmpHosts);
        if (data.syslogHosts !== undefined) setSyslogHosts(data.syslogHosts);
        
        if (data.sntp1 !== undefined) setSntp1(data.sntp1);
        if (data.sntp2 !== undefined) setSntp2(data.sntp2);
        
        if (data.hasE1 !== undefined) setHasE1(data.hasE1);
        if (data.e1SourceIp !== undefined) setE1SourceIp(data.e1SourceIp);
        if (data.e1DestIp !== undefined) setE1DestIp(data.e1DestIp);
        if (data.e1PwVlan !== undefined) setE1PwVlan(data.e1PwVlan);
        if (data.e1PwPriority !== undefined) setE1PwPriority(data.e1PwPriority);
        if (data.e1TdmStart !== undefined) setE1TdmStart(data.e1TdmStart);
        if (data.e1TdmEnd !== undefined) setE1TdmEnd(data.e1TdmEnd);
        if (data.e1BundleInterface !== undefined) setE1BundleInterface(data.e1BundleInterface);
        if (data.e1CircuitName !== undefined) setE1CircuitName(data.e1CircuitName);
        if (data.e1JitterBuffer !== undefined) setE1JitterBuffer(data.e1JitterBuffer);
        if (data.e1PacketDelay !== undefined) setE1PacketDelay(data.e1PacketDelay);
        if (data.e1VlanName !== undefined) setE1VlanName(data.e1VlanName);

        showToast('Sessão anterior restaurada!', 'success');
      } catch (err) {
        console.error('Erro ao ler a sessão anterior', err);
      }
    }
    setRestoreBannerVisible(false);
  };

  const discardPreviousSession = () => {
    localStorage.removeItem('datacom_cfg_v2');
    setRestoreBannerVisible(false);
    showToast('Sessão descartada.', 'info');
  };

  // --- SAVE SESSION (PERSIST) ---
  const saveSession = () => {
    const data = {
      hostname, model, totalPorts, uplinkPort, svcPort,
      vlanGer, vlanGerName, ipGer, maskGer, gw,
      vlanSvc, vlanSvcName, descUplink, descSvc,
      symmetric, rlIn, rlOut, autoBurst, burstIn, burstOut,
      conversionFactor, burstPercent,
      user1, user1Hash, user2, user2Hash, snmpRo1, snmpRo2, snmpRo3, snmpRo4, snmpRw,
      snmpHosts, syslogHosts, sntp1, sntp2,
      hasE1, e1SourceIp, e1DestIp, e1PwVlan, e1PwPriority, e1TdmStart, e1TdmEnd,
      e1BundleInterface, e1CircuitName, e1JitterBuffer, e1PacketDelay, e1VlanName
    };
    localStorage.setItem('datacom_cfg_v2', JSON.stringify(data));
  };

  useEffect(() => {
    saveSession();
  }, [
    hostname, model, totalPorts, uplinkPort, svcPort,
    vlanGer, vlanGerName, ipGer, maskGer, gw,
    vlanSvc, vlanSvcName, descUplink, descSvc,
    symmetric, rlIn, rlOut, autoBurst, burstIn, burstOut,
    conversionFactor, burstPercent,
    user1, user1Hash, user2, user2Hash, snmpRo1, snmpRo2, snmpRo3, snmpRo4, snmpRw,
    snmpHosts, syslogHosts, sntp1, sntp2,
    hasE1, e1SourceIp, e1DestIp, e1PwVlan, e1PwPriority, e1TdmStart, e1TdmEnd,
    e1BundleInterface, e1CircuitName, e1JitterBuffer, e1PacketDelay, e1VlanName
  ]);

  // --- MODEL CHANGE Topologies ---
  const handleModelChange = (selectedModel: string) => {
    setModel(selectedModel);
    if (selectedModel === 'DM2104') {
      setTotalPorts(8);
      setUplinkPort('1/1');
      setSvcPort('1/5');
    } else if (selectedModel === 'DM2108P') {
      setTotalPorts(8);
      setUplinkPort('1/1');
      setSvcPort('1/5');
    }
  };

  // --- PORT MAP INTERACTION ---
  const handlePortClick = (p: string) => {
    if (uplinkPort === p) {
      setUplinkPort('');
    } else if (svcPort === p) {
      setSvcPort('');
    } else if (!uplinkPort) {
      setUplinkPort(p);
    } else if (!svcPort) {
      setSvcPort(p);
    } else {
      setUplinkPort(p);
      setSvcPort('');
    }
  };

  // --- VALIDATORS ---
  const isValidIPv4 = (ip: string) => {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every(x => x !== '' && !isNaN(Number(x)) && Number(x) >= 0 && Number(x) <= 255 && String(Number(x)) === x);
  };

  const maskToCIDR = (m: string) => {
    m = m.trim();
    if (m.startsWith('/')) {
      const n = parseInt(m.slice(1));
      return (!isNaN(n) && n >= 0 && n <= 32) ? n : null;
    }
    const p = m.split('.');
    if (p.length !== 4) return null;
    let bits = 0, ended = false;
    for (const x of p) {
      const n = parseInt(x);
      if (isNaN(n) || n < 0 || n > 255) return null;
      const b = n.toString(2).padStart(8, '0');
      for (const c of b) {
        if (c === '1') {
          if (ended) return null;
          bits++;
        } else {
          ended = true;
        }
      }
    }
    return bits;
  };

  const cidrToDec = (cidr: number) => {
    if (cidr === 0) return '0.0.0.0';
    const m = 0xFFFFFFFF << (32 - cidr);
    return [(m >>> 24) & 0xFF, (m >>> 16) & 0xFF, (m >>> 8) & 0xFF, m & 0xFF].join('.');
  };

  const ipToInt = (ip: string) => {
    return ip.split('.').reduce((acc, o) => ((acc << 8) + parseInt(o)) >>> 0, 0);
  };

  const sameSubnet = (ip: string, gateway: string, cidr: number | null) => {
    if (!isValidIPv4(ip) || !isValidIPv4(gateway) || cidr === null) return null;
    const mask = cidr === 0 ? 0 : ((0xFFFFFFFF << (32 - cidr)) >>> 0);
    return (ipToInt(ip) & mask) === (ipToInt(gateway) & mask);
  };

  // Subnet hint calculated dynamic
  const cidrGer = maskToCIDR(maskGer);
  const isGwInSameSubnet = sameSubnet(ipGer, gw, cidrGer);

  // --- SYMMETRIC RATE LIMIT ---
  const handleRlInChange = (val: string) => {
    setRlIn(val);
    if (symmetric) {
      setRlOut(val);
    }
    if (autoBurst) {
      const ri = parseInt(val) || 0;
      setBurstIn(String(Math.max(512, Math.round(ri * (burstPercent / 100)))));
      if (symmetric) {
        setBurstOut(String(Math.max(512, Math.round(ri * (burstPercent / 100)))));
      }
    }
  };

  const handleRlOutChange = (val: string) => {
    setRlOut(val);
    if (autoBurst) {
      const ro = parseInt(val) || 0;
      setBurstOut(String(Math.max(512, Math.round(ro * (burstPercent / 100)))));
    }
  };

  // When check/uncheck checkboxes
  useEffect(() => {
    if (symmetric && rlIn) {
      setRlOut(rlIn);
    }
  }, [symmetric]);

  useEffect(() => {
    if (autoBurst) {
      const ri = parseInt(rlIn) || 0;
      const ro = parseInt(rlOut) || 0;
      setBurstIn(String(Math.max(512, Math.round(ri * (burstPercent / 100)))));
      setBurstOut(String(Math.max(512, Math.round(ro * (burstPercent / 100)))));
    }
  }, [autoBurst, burstPercent, rlIn, rlOut]);

  // --- COLLAPSE HANDLER ---
  const toggleSection = (idx: number) => {
    setCollapsedSections(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // --- DYNAMIC HOST HELPERS ---
  const handleAddHost = (type: 'snmp' | 'syslog') => {
    if (type === 'snmp') {
      setSnmpHosts([...snmpHosts, '']);
    } else {
      setSyslogHosts([...syslogHosts, '']);
    }
  };

  const handleRemoveHost = (type: 'snmp' | 'syslog', index: number) => {
    if (type === 'snmp') {
      setSnmpHosts(snmpHosts.filter((_, idx) => idx !== index));
    } else {
      setSyslogHosts(syslogHosts.filter((_, idx) => idx !== index));
    }
  };

  const handleHostChange = (type: 'snmp' | 'syslog', index: number, value: string) => {
    if (type === 'snmp') {
      const updated = [...snmpHosts];
      updated[index] = value;
      setSnmpHosts(updated);
    } else {
      const updated = [...syslogHosts];
      updated[index] = value;
      setSyslogHosts(updated);
    }
  };

  // --- PARSE CONFIG FILE IMPORT ---
  const parseCfgContent = (text: string) => {
    let found = 0;

    const hn = text.match(/^hostname\s+(\S+)/m);
    if (hn) {
      setHostname(hn[1]);
      found++;
    }

    const gatewayMatch = text.match(/^ip default-gateway\s+(\S+)/m);
    if (gatewayMatch) {
      setGw(gatewayMatch[1]);
      found++;
    }

    let importedVid = '';
    const vlans = [...text.matchAll(/^interface vlan (\d+)[\s\S]*?ip address (\S+)/gm)];
    if (vlans.length) {
      const [, vid, ipcidr] = vlans[0];
      const [ip, cidr] = ipcidr.split('/');
      setVlanGer(vid);
      importedVid = vid;
      setIpGer(ip);
      if (cidr) {
        setMaskGer('/' + cidr);
      }
      found++;
    }

    const vnames = [...text.matchAll(/^interface vlan (\d+)\s*\n\s*name\s+(\S+)/gm)];
    vnames.forEach(([, vid, name]) => {
      if (importedVid && parseInt(vid) === parseInt(importedVid)) {
        setVlanGerName(name);
      } else if (!importedVid && parseInt(vid) === parseInt(vlanGer)) {
        setVlanGerName(name);
      }
    });

    const rli = text.match(/rate-limit input rate\s+(\d+)\s+burst\s+(\d+)/);
    if (rli) {
      setRlIn(rli[1]);
      setBurstIn(rli[2]);
      found++;
    }
    const rlo = text.match(/rate-limit output rate\s+(\d+)\s+burst\s+(\d+)/);
    if (rlo) {
      setRlOut(rlo[1]);
      setBurstOut(rlo[2]);
    }

    const descs = [...text.matchAll(/^interface ethernet (\S+)\s*\n\s*description\s+(.+)/gm)];
    descs.forEach(([, port, desc]) => {
      if (port === uplinkPort) setDescUplink(desc.trim());
      if (port === svcPort) setDescSvc(desc.trim());
    });

    const communities = [...text.matchAll(/ip snmp-server community\s+(\S+)\s+(ro|rw)/gm)];
    const ros = communities.filter(m => m[2] === 'ro').map(m => m[1]);
    const rws = communities.filter(m => m[2] === 'rw').map(m => m[1]);
    if (ros[0]) setSnmpRo1(ros[0]);
    if (ros[1]) setSnmpRo2(ros[1]);
    if (ros[2]) setSnmpRo3(ros[2]);
    if (ros[3]) setSnmpRo4(ros[3]);
    if (rws[0]) setSnmpRw(rws[0]);

    const trapHosts = [...text.matchAll(/ip snmp-server host\s+(\S+)/gm)].map(m => m[1]);
    if (trapHosts.length) {
      setSnmpHosts(trapHosts);
      found++;
    }

    const syslogH = [...text.matchAll(/^logging host\s+(\S+)/gm)].map(m => m[1]);
    if (syslogH.length) {
      setSyslogHosts(syslogH);
    }

    const sntp = [...text.matchAll(/^sntp server\s+(\S+)/gm)].map(m => m[1]);
    if (sntp[0]) setSntp1(sntp[0]);
    if (sntp[1]) setSntp2(sntp[1]);

    const e1Pw = text.match(/^interface pw 1\/1\s*\n\s*source-ip-addr\s+(\S+)\s*\n\s*vlan\s+(\d+)\s+priority\s+(\d+)/m);
    if (e1Pw) {
      setHasE1(true);
      setE1SourceIp(e1Pw[1]);
      setE1PwVlan(e1Pw[2]);
      setE1PwPriority(e1Pw[3]);
      const bundle = text.match(/^interface bundle (\S+)\s*\n\s*destination-ip-address\s+(\S+)\s*\n\s*jitter-buffer\s+([\d\.]+)\s*\n\s*circuit-name\s+(.+)\s*\n\s*packet-delay\s+([\d\.]+)\s*\n\s*source-ip-address\s+(\S+)/m);
      if (bundle) {
        setE1BundleInterface(bundle[1]);
        setE1DestIp(bundle[2]);
        setE1JitterBuffer(bundle[3]);
        setE1CircuitName(bundle[4]);
        setE1PacketDelay(bundle[5]);
      }
      const tdm = text.match(/^interface tdm range (\S+)\s+(\S+)/m);
      if (tdm) {
        setE1TdmStart(tdm[1]);
        setE1TdmEnd(tdm[2]);
      }
      found++;
    }

    showToast(`✓ Importação concluída: ${found} seções extraídas.\nRevise e complete os campos restantes.`, 'success');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseCfgContent(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseCfgContent(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  // --- SCRIPT BUILDER / GENERATOR ---
  const handleGenerateScript = () => {
    const errList: string[] = [];

    const cleanHostname = hostname.trim();
    const vlanGerNum = parseInt(vlanGer);
    const vger_name = vlanGerName.trim() || `GER_${cleanHostname}`;
    const cleanIpGer = ipGer.trim();
    const cleanMaskGer = maskGer.trim();
    const cleanGw = gw.trim();
    const vlanSvcNum = parseInt(vlanSvc);
    const vsvc_name = vlanSvcName.trim() || `SVC_VLAN_${vlanSvc}`;
    const desc_ul = descUplink.trim();
    const desc_svc = descSvc.trim();
    const rateIn = parseInt(rlIn);
    const rateOut = parseInt(rlOut);
    const bIn = parseInt(burstIn) || 512;
    const bOut = parseInt(burstOut) || 512;

    if (!cleanHostname || !/^[a-zA-Z0-9\-]{3,64}$/.test(cleanHostname)) {
      errList.push('Hostname inválido (3–64 caracteres, apenas letras, números e hífens).');
    }
    if (isNaN(vlanGerNum) || vlanGerNum < 1 || vlanGerNum > 4094) {
      errList.push('VLAN de gerência inválida (deve ser entre 1 e 4094).');
    }
    if (!isValidIPv4(cleanIpGer)) {
      errList.push('IP de gerência inválido.');
    }
    const calculatedCidr = maskToCIDR(cleanMaskGer);
    if (calculatedCidr === null) {
      errList.push('Máscara de gerência inválida (ex: /27 ou 255.255.255.224).');
    }
    if (!isValidIPv4(cleanGw)) {
      errList.push('Default gateway inválido.');
    }
    if (isValidIPv4(cleanIpGer) && isValidIPv4(cleanGw) && calculatedCidr !== null) {
      if (!sameSubnet(cleanIpGer, cleanGw, calculatedCidr)) {
        errList.push('Gateway está fora da sub-rede de gerência!');
      }
    }
    if (isNaN(vlanSvcNum) || vlanSvcNum < 1 || vlanSvcNum > 4094) {
      errList.push('VLAN de serviço inválida (deve ser entre 1 e 4094).');
    }
    if (!uplinkPort) {
      errList.push('Selecione a porta uplink no mapa de portas.');
    }
    if (!svcPort) {
      errList.push('Selecione a porta de serviço no mapa de portas.');
    }
    if (uplinkPort && svcPort && uplinkPort === svcPort) {
      errList.push('Porta uplink e de serviço não podem ser idênticas.');
    }
    if (!desc_ul) {
      errList.push('Descrição da interface uplink é obrigatória.');
    }
    if (!desc_svc) {
      errList.push('Descrição da interface de serviço é obrigatória.');
    }
    if (isNaN(rateIn) || rateIn < 64) {
      errList.push('Rate-limit de entrada inválido (mínimo 64 kbps).');
    }
    if (isNaN(rateOut) || rateOut < 64) {
      errList.push('Rate-limit de saída inválido (mínimo 64 kbps).');
    }

    // Credenciais
    if (!user1.trim()) errList.push('Usuário 1 (Admin) obrigatório.');
    if (!user1Hash.trim()) errList.push('Hash da senha do Usuário 1 obrigatório.');
    if (!user2.trim()) errList.push('Usuário 2 obrigatório.');
    if (!user2Hash.trim()) errList.push('Hash da senha do Usuário 2 obrigatório.');

    // E1 Params validation
    if (hasE1) {
      if (!e1SourceIp.trim()) errList.push('E1: Source IP obrigatório.');
      if (!e1DestIp.trim()) errList.push('E1: Destination IP obrigatório.');
      const pwV = parseInt(e1PwVlan);
      if (isNaN(pwV) || pwV < 1 || pwV > 4094) errList.push('E1: PW VLAN inválida (1–4094).');
      if (!e1CircuitName.trim()) errList.push('E1: Circuit Name obrigatório.');
    }

    setErrors(errList);

    if (errList.length > 0) {
      showToast('Por favor, corrija os erros destacados no painel.', 'error');
      return;
    }

    // BUILD SCRIPT TEXT
    const ul = parseInt(uplinkPort.split('/')[1]);
    const sv = parseInt(svcPort.split('/')[1]);

    const getPortRangesExcluded = (excluded: number[]) => {
      const ranges: [number, number][] = [];
      let start: number | null = null;
      for (let i = 1; i <= totalPorts; i++) {
        if (!excluded.includes(i)) {
          if (start === null) start = i;
        } else {
          if (start !== null) {
            ranges.push([start, i - 1]);
            start = null;
          }
        }
      }
      if (start !== null) ranges.push([start, totalPorts]);
      return ranges;
    };

    const disabledRanges = getPortRangesExcluded([ul, sv]);
    const dec_ger = calculatedCidr !== null ? cidrToDec(calculatedCidr) : '';
    const ts = new Date().toLocaleString('pt-BR');

    let script = `! ================================================================\n`;
    script += `! ${model} — Configuração gerada automaticamente\n`;
    script += `! Equipamento : ${cleanHostname}\n`;
    script += `! Uplink      : ${uplinkPort}  |  Serviço: ${svcPort}\n`;
    script += `! Gerado em   : ${ts}\n`;
    script += `! ================================================================\n\n`;

    script += `hostname ${cleanHostname}\n`;
    script += `!\n`;
    script += `terminal timeout 300\n`;
    script += `!\n`;
    script += `username ${user1.trim()} access-level 15\n`;
    script += `username ${user1.trim()} password 7 ${user1Hash.trim()}\n`;
    script += `username ${user2.trim()} access-level 15\n`;
    script += `username ${user2.trim()} password 7 ${user2Hash.trim()}\n`;
    script += `!\n`;
    script += `clock timezone Brasilia -3\n`;
    script += `!\n`;
    script += `banner login\n~\n`;
    script += `################################################################\n`;
    script += `#      ATENCAO: ACESSO PERMITIDO PARA PESSOAL AUTORIZADO.      #\n`;
    script += `#                DESCONECTE-SE IMEDIATAMENTE                   #\n`;
    script += `# ATTENTION: AUTHORIZED PERSONAL ONLY. DISCONNECT IMMEDIATELY. #\n`;
    script += `################################################################\n~\n`;
    script += `!\n`;
    script += `cpu-dos-protect rate-limit global 150\n`;
    script += `!\n`;
    script += `vlan qinq\n`;
    script += `!\n`;
    script += `interface vlan 1\n`;
    script += `!\n`;
    script += `interface vlan 2\n`;
    script += ` set-member untagged ethernet all\n`;
    script += `!\n`;
    script += `interface vlan ${vlanSvcNum}\n`;
    script += ` name ${vsvc_name}\n`;
    script += ` set-member tagged ethernet ${uplinkPort}\n`;
    script += ` set-member untagged ethernet ${svcPort}\n`;
    script += `!\n`;
    script += `interface vlan ${vlanGerNum}\n`;
    script += ` name ${vger_name}\n`;
    script += ` ip address ${cleanIpGer}/${calculatedCidr}\n`;
    script += ` set-member tagged ethernet ${uplinkPort}\n`;
    script += `!\n`;
    script += `vlan-group 1\n`;
    script += ` vlan-group 1 vlan all\n`;
    script += `!\n`;
    script += `interface ethernet ${uplinkPort}\n`;
    script += ` description ${desc_ul}\n`;
    script += ` no negotiation\n`;
    script += ` no spanning-tree 1\n`;
    script += ` speed-duplex 1000full\n`;
    script += ` switchport native vlan 2\n`;
    script += ` no switchport storm-control broadcast\n`;
    script += ` no switchport storm-control multicast\n`;
    script += ` no switchport storm-control dlf\n`;
    script += ` no oam\n`;
    script += `!\n`;

    // Disable unneeded ports
    disabledRanges.forEach(([a, b]) => {
      if (a === b) {
        script += `interface ethernet 1/${a}\n`;
      } else {
        script += `interface ethernet range 1/${a} 1/${b}\n`;
      }
      script += ` shutdown\n`;
      script += ` switchport native vlan 2\n`;
      script += ` no switchport storm-control broadcast\n`;
      script += ` no switchport storm-control multicast\n`;
      script += ` no switchport storm-control dlf\n`;
      script += `!\n`;
    });

    script += `interface ethernet ${svcPort}\n`;
    script += ` description ${desc_svc}\n`;
    script += ` rate-limit input rate ${rateIn} burst ${bIn}\n`;
    script += ` rate-limit output rate ${rateOut} burst ${bOut}\n`;
    script += ` spanning-tree restricted-tcn\n`;
    script += ` no spanning-tree 1\n`;
    script += ` switchport native vlan ${vlanSvcNum}\n`;
    script += ` no switchport storm-control broadcast\n`;
    script += ` no switchport storm-control multicast\n`;
    script += ` no switchport storm-control dlf\n`;
    script += `!\n`;
    script += `interface mgmt-eth\n`;
    script += ` ip address 192.168.0.25/24\n`;
    script += `!\n`;
    script += `no remote-devices enable\n`;
    script += `remote-devices enable ethernet range 1/1 1/4\n`;
    script += `!\n`;
    script += `ip default-gateway ${cleanGw}\n`;
    script += `!\n`;
    script += `ip telnet server\n`;
    script += `ip http server\n`;
    script += `ip http secure-server\n`;
    script += `ip ssh server\n`;
    script += `!\n`;
    script += `ip snmp-server\n`;
    script += `ip snmp-server community ${snmpRo3} ro\n`;
    script += `ip snmp-server community ${snmpRo4} ro\n`;
    script += `ip snmp-server community ${snmpRo1} ro\n`;
    script += `ip snmp-server community ${snmpRo2} ro\n`;
    script += `ip snmp-server community ${snmpRw} rw\n`;
    script += `ip snmp-server traps dying-gasp\n`;

    // Active trap hosts
    snmpHosts.filter(h => h.trim() !== '').forEach(h => {
      script += `ip snmp-server host ${h.trim()} version 2c ${snmpRo1} 5\n`;
    });
    script += `!\n`;
    script += `management http-client 200.204.1.0/24\n`;
    script += `management snmp-client 186.239.229.152/29\n`;
    script += `management snmp-client 187.100.21.193/32\n`;
    script += `management snmp-client 187.100.224.0/22\n`;
    script += `management snmp-client 200.204.1.0/24\n`;
    script += `management snmp-client 201.93.48.224/27\n`;
    script += `management ssh-client 200.204.1.0/24\n`;
    script += `!\n`;
    script += `logging history ram 7\n`;
    script += `logging history flash 6\n`;
    script += `logging trap 7\n`;

    // Logging syslog hosts
    syslogHosts.filter(h => h.trim() !== '').forEach(h => {
      script += `logging host ${h.trim()}\n`;
    });
    script += `!\n`;
    script += `sntp client\n`;
    if (sntp1) script += `sntp server ${sntp1.trim()}\n`;
    if (sntp2) script += `sntp server ${sntp2.trim()}\n`;
    script += `!\n`;
    script += `spanning-tree 1\n`;
    script += `spanning-tree 1 vlan-group 1\n`;
    script += `!\n`;
    script += `filter 1 remark BROADCAST_VLAN_GERENCIA action red-deny match destination-mac host FF:FF:FF:FF:FF:FF match vlan ${vlanGerNum} ingress ethernet all meter 1 priority 0\n`;
    script += `filter 2 remark MULTICAST_VLAN_GERENCIA action red-deny match destination-mac 01:00:00:00:00:00 01:00:00:00:00:00 match vlan ${vlanGerNum} ingress ethernet all meter 2 priority 0\n`;
    script += `filter 3 action 802.1p 6 match vlan ${vlanGerNum} ingress ethernet all priority 8\n`;
    script += `!\n`;
    script += `meter 1 mode flow remark BROADCAST_VLAN_GERENCIA rate-limit 128 burst 128\n`;
    script += `meter 2 mode flow remark MULTICAST_VLAN_GERENCIA rate-limit 128 burst 128\n`;
    script += `!\n`;

    // E1 Params
    if (hasE1) {
      script += `! --- E1 / PW / TDM / Bundle ---\n`;
      script += `sync-source hierarchy 1 transmit-clock-source adaptive bundle ${e1BundleInterface}\n`;
      script += `sync-source hierarchy 1 enable\n`;
      script += `!\n`;
      script += `interface vlan ${e1PwVlan}\n`;
      script += ` name ${e1VlanName || 'VLAN_E1'}\n`;
      script += ` set-member tagged ethernet ${uplinkPort}\n`;
      script += `!\n`;
      script += `interface pw 1/1\n`;
      script += ` source-ip-addr ${e1SourceIp.trim()}\n`;
      script += ` vlan ${e1PwVlan} priority ${e1PwPriority}\n`;
      script += `!\n`;
      script += `interface tdm range ${e1TdmStart} ${e1TdmEnd}\n`;
      script += ` no shutdown\n`;
      script += `!\n`;
      script += `interface bundle ${e1BundleInterface}\n`;
      script += ` destination-ip-address ${e1DestIp.trim()}\n`;
      script += ` jitter-buffer ${e1JitterBuffer}\n`;
      script += ` circuit-name ${e1CircuitName.trim()}\n`;
      script += ` packet-delay ${e1PacketDelay}\n`;
      script += ` source-ip-address ${e1SourceIp.trim()}\n`;
      script += ` no shutdown\n`;
      script += `!\n`;
    }

    setGeneratedScript(script);
    showToast('Script Datacom gerado com sucesso!', 'success');

    setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  const handleResetForm = () => {
    if (confirm('Tem certeza de que deseja limpar todos os campos?')) {
      setHostname('');
      setModel('DM2104');
      setTotalPorts(8);
      setUplinkPort('1/1');
      setSvcPort('1/5');
      setVlanGer('');
      setVlanGerName('');
      setIpGer('');
      setMaskGer('');
      setGw('');
      setVlanSvc('');
      setVlanSvcName('');
      setDescUplink('');
      setDescSvc('');
      setSymmetric(false);
      setRlIn('');
      setRlOut('');
      setAutoBurst(false);
      setBurstIn('512');
      setBurstOut('512');
      setUser1('');
      setUser1Hash('');
      setUser2('');
      setUser2Hash('');
      setSnmpRo1('GESTION');
      setSnmpRo2('SMART');
      setSnmpRo3('701hHg61');
      setSnmpRo4('g3rd@tSWT');
      setSnmpRw('G34@T@c5M');
      setSnmpHosts(['187.100.227.70', '187.100.21.193', '200.204.1.89', '200.204.1.91']);
      setSyslogHosts(['200.153.1.138', '200.204.1.106', '187.100.227.70', '187.100.221.193']);
      setSntp1('200.204.1.103');
      setSntp2('200.204.1.104');
      setHasE1(false);
      setGeneratedScript('');
      setErrors([]);
      localStorage.removeItem('datacom_cfg_v2');
      showToast('Configurações limpas.', 'info');
    }
  };

  const handleCopyScript = () => {
    if (!generatedScript) return;
    navigator.clipboard.writeText(generatedScript)
      .then(() => showToast('Configuração copiada para área de transferência!', 'success'))
      .catch(() => showToast('Erro ao copiar configuração.', 'error'));
  };

  const handleDownloadScript = () => {
    if (!generatedScript) return;
    const blob = new Blob([generatedScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${hostname.trim() || 'config'}.cfg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Download do arquivo .cfg iniciado!', 'success');
  };

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      {restoreBannerVisible && (
        <div className="restore-banner show" style={{ display: 'flex', marginBottom: '20px' }}>
          <span>💾 Dados de sessão anterior encontrados. Deseja restaurar?</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button className="btn-sm add" onClick={loadPreviousSession} style={{ padding: '4px 10px', height: 'auto', minHeight: 'auto' }}>Restaurar</button>
            <button className="btn-sm del" onClick={discardPreviousSession} style={{ padding: '4px 10px', height: 'auto', minHeight: 'auto' }}>Descartar</button>
          </div>
        </div>
      )}

      <h2><i className="fas fa-terminal"></i> Datacom DmOS — Config Generator</h2>
      <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '25px' }}>
        Preencha os campos para gerar automaticamente o script de switch Datacom DmOS.
      </p>

      {/* --- SEÇÃO 1: IDENTIFICAÇÃO --- */}
      <div className={`section ${collapsedSections[0] ? 'collapsed' : ''}`} id="sec0">
        <div className="section-head" onClick={() => toggleSection(0)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">1</div>
          <div>
            <h2>Identificação <span className="sub">— hostname e modelo</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[0] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>
        
        <div className="section-body" style={{ display: collapsedSections[0] ? 'none' : 'grid' }}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="hostname">Hostname <span className="required">*</span></label>
              <input
                type="text"
                id="hostname"
                placeholder="ex: m-br-sp-mres-pb-swt035"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
              />
              <span className="form-help">Apenas letras, números e hífens.</span>
            </div>
            <div className="form-group">
              <label htmlFor="model">Modelo</label>
              <select id="model" value={model} onChange={(e) => handleModelChange(e.target.value)}>
                <option value="DM2104">DM2104 (8 portas)</option>
                <option value="DM2108P">DM2108P (8 portas PoE)</option>
                <option value="custom">Personalizado</option>
              </select>
              <span className="form-help">Define a topologia padrão de portas.</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="total_ports">Total de Portas</label>
              <select
                id="total_ports"
                value={totalPorts}
                onChange={(e) => setTotalPorts(Number(e.target.value))}
                disabled={model !== 'custom'}
              >
                <option value="4">4 portas</option>
                <option value="8">8 portas</option>
                <option value="12">12 portas</option>
                <option value="16">16 portas</option>
              </select>
            </div>
          </div>

          {/* PORT MAP */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Mapa de Portas interativas</label>
            <div className="port-picker" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {Array.from({ length: totalPorts }).map((_, idx) => {
                const p = `1/${idx + 1}`;
                const isUplink = uplinkPort === p;
                const isSvc = svcPort === p;
                let btnClass = 'port-btn';
                if (isUplink) btnClass += ' active uplink-sel';
                if (isSvc) btnClass += ' active svc-sel';

                return (
                  <button
                    key={idx}
                    type="button"
                    className={btnClass}
                    style={{
                      border: isUplink ? '2px solid var(--accent)' : isSvc ? '2px solid var(--warning)' : '1px solid var(--border)',
                      background: isUplink ? 'rgba(var(--accent-rgb), 0.15)' : isSvc ? 'rgba(245, 158, 11, 0.15)' : 'var(--card)',
                      color: isUplink ? 'var(--accent)' : isSvc ? 'var(--warning)' : 'var(--fg)',
                      minWidth: '55px',
                      padding: '8px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onClick={() => handlePortClick(p)}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <div className="port-legend" style={{ display: 'flex', gap: '15px', marginTop: '10px', fontSize: '12px', color: 'var(--muted)' }}>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)', marginRight: '5px' }}></span>Uplink: <b>{uplinkPort || 'Nenhum'}</b></span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--warning)', marginRight: '5px' }}></span>Serviço: <b>{svcPort || 'Nenhum'}</b></span>
            </div>
          </div>

          {/* IMPORT ZONE */}
          <div
            className={`import-zone ${isDragOver ? 'drag-over' : ''}`}
            style={{
              gridColumn: '1 / -1',
              border: '2px dashed var(--border)',
              padding: '20px',
              textAlign: 'center',
              borderRadius: '12px',
              cursor: 'pointer',
              background: isDragOver ? 'rgba(var(--accent-rgb), 0.05)' : 'rgba(0,0,0,0.02)'
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              ⬆ <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Importar arquivo .cfg ou .txt existente</span> para pré-preencher campos · ou arraste e solte o arquivo aqui.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".cfg,.txt"
              onChange={handleImportFile}
            />
          </div>
        </div>
      </div>

      {/* --- SEÇÃO 2: VLAN DE GERÊNCIA --- */}
      <div className={`section ${collapsedSections[1] ? 'collapsed' : ''}`} id="sec1">
        <div className="section-head" onClick={() => toggleSection(1)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">2</div>
          <div>
            <h2>VLAN de Gerência <span className="sub">— interface vlan + IP</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[1] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>

        <div className="section-body" style={{ display: collapsedSections[1] ? 'none' : 'grid' }}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="vlan_ger">VLAN ID Gerência <span className="required">*</span></label>
              <input
                type="number"
                id="vlan_ger"
                placeholder="ex: 3569"
                value={vlanGer}
                onChange={(e) => setVlanGer(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="vlan_ger_name">Nome da VLAN Gerência</label>
              <input
                type="text"
                id="vlan_ger_name"
                placeholder="ex: GER_m-br-sp-mres-pb-swa-01"
                value={vlanGerName}
                onChange={(e) => setVlanGerName(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ip_ger">IP de Gerência <span className="required">*</span></label>
              <input
                type="text"
                id="ip_ger"
                placeholder="ex: 10.248.84.230"
                value={ipGer}
                onChange={(e) => setIpGer(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="mask_ger">Máscara / Prefixo <span className="required">*</span></label>
              <input
                type="text"
                id="mask_ger"
                placeholder="ex: /27 ou 255.255.255.224"
                value={maskGer}
                onChange={(e) => setMaskGer(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="gw">Default Gateway <span className="required">*</span></label>
              <input
                type="text"
                id="gw"
                placeholder="ex: 10.248.84.225"
                value={gw}
                onChange={(e) => setGw(e.target.value)}
              />
            </div>
          </div>

          {ipGer && gw && maskGer && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              {isGwInSameSubnet === true ? (
                <span style={{ color: 'var(--success)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <i className="fas fa-check-circle"></i> ✓ Gateway está na mesma sub-rede!
                </span>
              ) : isGwInSameSubnet === false ? (
                <span style={{ color: 'var(--warning)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <i className="fas fa-exclamation-triangle"></i> ⚠ Atenção: Gateway parece fora da sub-rede do IP de gerência.
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* --- SEÇÃO 3: VLAN DE SERVIÇO --- */}
      <div className={`section ${collapsedSections[2] ? 'collapsed' : ''}`} id="sec2">
        <div className="section-head" onClick={() => toggleSection(2)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">3</div>
          <div>
            <h2>VLAN de Serviço <span className="sub">— interface vlan cliente</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[2] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>

        <div className="section-body" style={{ display: collapsedSections[2] ? 'none' : 'grid' }}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="vlan_svc">VLAN ID Serviço <span className="required">*</span></label>
              <input
                type="number"
                id="vlan_svc"
                placeholder="ex: 103"
                value={vlanSvc}
                onChange={(e) => setVlanSvc(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="vlan_svc_name">Nome da VLAN Serviço</label>
              <input
                type="text"
                id="vlan_svc_name"
                placeholder="ex: VPN_SABESP_1Mbps_ATP-3818/23"
                value={vlanSvcName}
                onChange={(e) => setVlanSvcName(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* --- SEÇÃO 4: INTERFACES --- */}
      <div className={`section ${collapsedSections[3] ? 'collapsed' : ''}`} id="sec3">
        <div className="section-head" onClick={() => toggleSection(3)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">4</div>
          <div>
            <h2>Interfaces <span className="sub">— uplink e serviço</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[3] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>

        <div className="section-body" style={{ display: collapsedSections[3] ? 'none' : 'grid' }}>
          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Uplink</h3>
          <div className="form-group">
            <label htmlFor="desc_uplink">Description — ethernet {uplinkPort || '1/1'} <span className="required">*</span></label>
            <input
              type="text"
              id="desc_uplink"
              placeholder="ex: IP_ULK_FIBRA_m-br-sp-mres-pb-swa-01_10.217.84.226_Eth_1/1/6"
              value={descUplink}
              onChange={(e) => setDescUplink(e.target.value)}
            />
          </div>

          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px', marginTop: '15px' }}>Serviço ao Cliente</h3>
          <div className="form-group">
            <label htmlFor="desc_svc">Description — ethernet {svcPort || '1/5'} <span className="required">*</span></label>
            <input
              type="text"
              id="desc_svc"
              placeholder="ex: VPN_CIA_SANE_BASICO_SP_1Mbps_ATP-3818/23_ID-1641120"
              value={descSvc}
              onChange={(e) => setDescSvc(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* --- SEÇÃO 5: RATE-LIMITING --- */}
      <div className={`section ${collapsedSections[4] ? 'collapsed' : ''}`} id="sec4">
        <div className="section-head" onClick={() => toggleSection(4)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">5</div>
          <div>
            <h2>Rate-Limiting <span className="sub">— interface de serviço</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[4] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>

        <div className="section-body" style={{ display: collapsedSections[4] ? 'none' : 'grid' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            {/* Coluna 1: Campos do Formulário */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {/* Parâmetros de Conversão e Burst */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', background: 'rgba(var(--accent-rgb), 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>Fator de Conversão Mbps ➜ kbps</span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${conversionFactor === 1024 ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px', fontSize: '12px', flex: 1 }}
                      onClick={() => setConversionFactor(1024)}
                    >
                      1024 (Datacom)
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${conversionFactor === 1000 ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px', fontSize: '12px', flex: 1 }}
                      onClick={() => setConversionFactor(1000)}
                    >
                      1000 (Decimal)
                    </button>
                  </div>
                </div>

                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)' }}>Heurística de Burst Automático</span>
                  <select
                    value={burstPercent}
                    onChange={(e) => setBurstPercent(Number(e.target.value))}
                    style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--card)' }}
                  >
                    <option value={10}>10% do rate-limit (padrão)</option>
                    <option value={15}>15% do rate-limit</option>
                    <option value={20}>20% do rate-limit</option>
                    <option value={25}>25% do rate-limit</option>
                  </select>
                </div>
              </div>

              <label className="toggle-row g-full" htmlFor="symmetric" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '15px' }}>
                <input
                  type="checkbox"
                  id="symmetric"
                  checked={symmetric}
                  onChange={(e) => setSymmetric(e.target.checked)}
                />
                <span className="toggle-label">Rate-limit simétrico (IN = OUT)</span>
              </label>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="rl_in">Rate-Limit Input (kbps) <span className="required">*</span></label>
                  <input
                    type="number"
                    id="rl_in"
                    placeholder="ex: 1024"
                    min="64"
                    value={rlIn}
                    onChange={(e) => handleRlInChange(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="rl_out">Rate-Limit Output (kbps) <span className="required">*</span></label>
                  <input
                    type="number"
                    id="rl_out"
                    placeholder="ex: 1024"
                    min="64"
                    value={rlOut}
                    disabled={symmetric}
                    onChange={(e) => handleRlOutChange(e.target.value)}
                  />
                </div>
              </div>

              <hr style={{ margin: '15px 0', borderColor: 'var(--border)' }} />

              <label className="toggle-row g-full" htmlFor="auto_burst" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '15px' }}>
                <input
                  type="checkbox"
                  id="auto_burst"
                  checked={autoBurst}
                  onChange={(e) => setAutoBurst(e.target.checked)}
                />
                <span className="toggle-label">Calcular burst automaticamente ({burstPercent}% do rate-limit, mín. 512)</span>
              </label>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="burst_in">Burst Input (kbps)</label>
                  <input
                    type="number"
                    id="burst_in"
                    min="64"
                    value={burstIn}
                    disabled={autoBurst}
                    onChange={(e) => setBurstIn(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="burst_out">Burst Output (kbps)</label>
                  <input
                    type="number"
                    id="burst_out"
                    min="64"
                    value={burstOut}
                    disabled={autoBurst}
                    onChange={(e) => setBurstOut(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Coluna 2: Tabela de Seleção Rápida */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--accent)' }}>
                  <i className="fas fa-bolt" style={{ marginRight: '6px' }}></i>
                  Seleção Rápida de Banda
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'rgba(var(--accent-rgb), 0.1)', padding: '2px 8px', borderRadius: '20px', fontWeight: 500 }}>
                  Mbps ➜ kbps
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                Clique em uma linha ou use os botões para definir a velocidade correspondente.
              </p>

              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)' }}>
                <table style={{ width: '100%', margin: 0, fontSize: '13px', borderCollapse: 'collapse', boxShadow: 'none' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--card)' }}>
                    <tr>
                      <th style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '2px solid var(--border)', textAlign: 'left', background: 'rgba(var(--accent-rgb), 0.05)' }}>Mbps</th>
                      <th style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '2px solid var(--border)', textAlign: 'left', background: 'rgba(var(--accent-rgb), 0.05)' }}>kbps</th>
                      <th style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '2px solid var(--border)', textAlign: 'center', background: 'rgba(var(--accent-rgb), 0.05)' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      1, 2, 5, 10, 15, 20, 25, 30, 50, 100, 200, 300, 500, 1000
                    ].map((mbps) => {
                      const kbps = mbps * conversionFactor;
                      const isActiveIn = String(kbps) === rlIn;
                      const isActiveOut = String(kbps) === rlOut;
                      const isFullyActive = isActiveIn && (symmetric || isActiveOut);

                      return (
                        <tr 
                          key={mbps} 
                          style={{ 
                            backgroundColor: isFullyActive ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s'
                          }}
                          onClick={() => {
                            handleRlInChange(String(kbps));
                            if (!symmetric) handleRlOutChange(String(kbps));
                          }}
                        >
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: isFullyActive ? 'var(--accent)' : 'inherit', textAlign: 'left' }}>
                            {mbps} Mbps
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: isFullyActive ? 'var(--accent)' : 'var(--muted)', textAlign: 'left' }}>
                            {kbps.toLocaleString('pt-BR')}
                          </td>
                          <td style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              {symmetric ? (
                                <button
                                  className="btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minHeight: 'auto', background: isFullyActive ? 'var(--accent)' : 'var(--border)', color: isFullyActive ? '#fff' : 'var(--fg)', border: 'none', borderRadius: '4px' }}
                                  onClick={() => {
                                    handleRlInChange(String(kbps));
                                  }}
                                >
                                  Usar
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="btn-sm"
                                    style={{ 
                                      padding: '2px 6px', 
                                      fontSize: '10px', 
                                      height: 'auto', 
                                      minHeight: 'auto', 
                                      background: isActiveIn ? 'var(--accent)' : 'var(--border)', 
                                      color: isActiveIn ? '#fff' : 'var(--fg)',
                                      border: 'none',
                                      borderRadius: '4px'
                                    }}
                                    onClick={() => handleRlInChange(String(kbps))}
                                    title="Aplicar apenas ao Input"
                                  >
                                    IN
                                  </button>
                                  <button
                                    className="btn-sm"
                                    style={{ 
                                      padding: '2px 6px', 
                                      fontSize: '10px', 
                                      height: 'auto', 
                                      minHeight: 'auto', 
                                      background: isActiveOut ? 'var(--accent)' : 'var(--border)', 
                                      color: isActiveOut ? '#fff' : 'var(--fg)',
                                      border: 'none',
                                      borderRadius: '4px'
                                    }}
                                    onClick={() => handleRlOutChange(String(kbps))}
                                    title="Aplicar apenas ao Output"
                                  >
                                    OUT
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- SEÇÃO 6: CREDENCIAIS & SNMP --- */}
      <div className={`section ${collapsedSections[5] ? 'collapsed' : ''}`} id="sec5">
        <div className="section-head" onClick={() => toggleSection(5)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">6</div>
          <div>
            <h2>Credenciais & SNMP <span className="sub">— usuários, comunidades, hosts</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[5] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>

        <div className="section-body" style={{ display: collapsedSections[5] ? 'none' : 'grid' }}>
          <div className="sec-notice g-full" style={{ marginBottom: '15px' }}>
            <span className="ico">🔒</span>
            <p>
              Este gerador de switch Datacom contém credenciais e comunidades SNMP. Trate o script final .cfg de forma estritamente confidencial.
            </p>
          </div>

          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Usuários de Acesso</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="user1">Usuário 1 (Admin) <span className="required">*</span></label>
              <input
                type="text"
                id="user1"
                placeholder="ex: admin"
                value={user1}
                onChange={(e) => setUser1(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="user1_hash">Hash de Senha — Usuário 1 <span className="required">*</span></label>
              <input
                type="text"
                id="user1_hash"
                placeholder="Hash SHA1 (password 7)"
                value={user1Hash}
                onChange={(e) => setUser1Hash(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="user2">Usuário 2 <span className="required">*</span></label>
              <input
                type="text"
                id="user2"
                placeholder="ex: txn1"
                value={user2}
                onChange={(e) => setUser2(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="user2_hash">Hash de Senha — Usuário 2 <span className="required">*</span></label>
              <input
                type="text"
                id="user2_hash"
                placeholder="Hash SHA1 (password 7)"
                value={user2Hash}
                onChange={(e) => setUser2Hash(e.target.value)}
              />
            </div>
          </div>

          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px', marginTop: '15px' }}>Comunidades SNMP</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="snmp_ro1">Comunidade RO — Principal</label>
              <input type="text" id="snmp_ro1" value={snmpRo1} onChange={(e) => setSnmpRo1(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="snmp_ro2">Comunidade RO — Secundária</label>
              <input type="text" id="snmp_ro2" value={snmpRo2} onChange={(e) => setSnmpRo2(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="snmp_ro3">Comunidade RO — Adicional 1</label>
              <input type="text" id="snmp_ro3" value={snmpRo3} onChange={(e) => setSnmpRo3(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="snmp_ro4">Comunidade RO — Adicional 2</label>
              <input type="text" id="snmp_ro4" value={snmpRo4} onChange={(e) => setSnmpRo4(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="snmp_rw">Comunidade RW</label>
            <input type="text" id="snmp_rw" value={snmpRw} onChange={(e) => setSnmpRw(e.target.value)} />
          </div>

          {/* Dynamic SNMP trap hosts */}
          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px', marginTop: '15px' }}>Hosts SNMP Trap</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {snmpHosts.map((host, index) => (
              <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="IP do Host"
                  value={host}
                  onChange={(e) => handleHostChange('snmp', index, e.target.value)}
                  style={{ flex: 1, padding: '10px' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minWidth: 'auto', padding: '10px 15px', margin: 0 }}
                  onClick={() => handleRemoveHost('snmp', index)}
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start', marginTop: '5px' }}
              onClick={() => handleAddHost('snmp')}
            >
              <i className="fas fa-plus"></i> Adicionar Host Trap
            </button>
          </div>

          {/* Dynamic Syslog hosts */}
          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px', marginTop: '15px' }}>Hosts Syslog</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {syslogHosts.map((host, index) => (
              <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="IP do Host"
                  value={host}
                  onChange={(e) => handleHostChange('syslog', index, e.target.value)}
                  style={{ flex: 1, padding: '10px' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minWidth: 'auto', padding: '10px 15px', margin: 0 }}
                  onClick={() => handleRemoveHost('syslog', index)}
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start', marginTop: '5px' }}
              onClick={() => handleAddHost('syslog')}
            >
              <i className="fas fa-plus"></i> Adicionar Host Syslog
            </button>
          </div>

          <h3 style={{ fontSize: '15px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '5px', marginTop: '15px' }}>Clientes SNTP</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sntp1">Servidor SNTP 1</label>
              <input type="text" id="sntp1" value={sntp1} onChange={(e) => setSntp1(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="sntp2">Servidor SNTP 2</label>
              <input type="text" id="sntp2" value={sntp2} onChange={(e) => setSntp2(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* --- SEÇÃO 7: E1 / TDM / PW / BUNDLE (OPCIONAL) --- */}
      <div className={`section ${collapsedSections[6] ? 'collapsed' : ''}`} id="sec6">
        <div className="section-head" onClick={() => toggleSection(6)} style={{ cursor: 'pointer' }}>
          <div className="sec-num">7</div>
          <div>
            <h2>E1 / TDM / PW / Bundle <span className="sub">— opcional</span></h2>
          </div>
          <span className="chevron" style={{ transform: collapsedSections[6] ? 'rotate(-90deg)' : 'none' }}>▾</span>
        </div>

        <div className="section-body" style={{ display: collapsedSections[6] ? 'none' : 'grid' }}>
          <label className="toggle-row g-full" htmlFor="has_e1" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '15px' }}>
            <input
              type="checkbox"
              id="has_e1"
              checked={hasE1}
              onChange={(e) => setHasE1(e.target.checked)}
            />
            <span className="toggle-label">Ativar configurações de E1, PW, TDM e Bundle para o Cliente?</span>
          </label>

          {hasE1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="e1_source_ip">Source IP (PW / Bundle) <span className="required">*</span></label>
                  <input
                    type="text"
                    id="e1_source_ip"
                    placeholder="ex: 192.168.100.2"
                    value={e1SourceIp}
                    onChange={(e) => setE1SourceIp(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="e1_dest_ip">Destination IP (Bundle) <span className="required">*</span></label>
                  <input
                    type="text"
                    id="e1_dest_ip"
                    placeholder="ex: 192.168.100.1"
                    value={e1DestIp}
                    onChange={(e) => setE1DestIp(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="e1_pw_vlan">PW VLAN ID <span className="required">*</span></label>
                  <input
                    type="number"
                    id="e1_pw_vlan"
                    placeholder="ex: 301"
                    value={e1PwVlan}
                    onChange={(e) => setE1PwVlan(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="e1_pw_priority">PW Priority</label>
                  <input
                    type="number"
                    id="e1_pw_priority"
                    min="0"
                    max="7"
                    value={e1PwPriority}
                    onChange={(e) => setE1PwPriority(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="e1_tdm_start">TDM Range Start</label>
                  <input
                    type="text"
                    id="e1_tdm_start"
                    value={e1TdmStart}
                    onChange={(e) => setE1TdmStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="e1_tdm_end">TDM Range End</label>
                  <input
                    type="text"
                    id="e1_tdm_end"
                    value={e1TdmEnd}
                    onChange={(e) => setE1TdmEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="e1_bundle_interface">Bundle Interface</label>
                  <input
                    type="text"
                    id="e1_bundle_interface"
                    value={e1BundleInterface}
                    onChange={(e) => setE1BundleInterface(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="e1_vlan_name">VLAN E1 Name</label>
                  <input
                    type="text"
                    id="e1_vlan_name"
                    value={e1VlanName}
                    onChange={(e) => setE1VlanName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="e1_circuit_name">Circuit Name <span className="required">*</span></label>
                <input
                  type="text"
                  id="e1_circuit_name"
                  placeholder="ex: 1X_DDR_INS_SOCRATES_ATP_2584/20_ETH_5/17"
                  value={e1CircuitName}
                  onChange={(e) => setE1CircuitName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="e1_jitter_buffer">Jitter Buffer (ms)</label>
                  <input
                    type="text"
                    id="e1_jitter_buffer"
                    value={e1JitterBuffer}
                    onChange={(e) => setE1JitterBuffer(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="e1_packet_delay">Packet Delay (ms)</label>
                  <input
                    type="text"
                    id="e1_packet_delay"
                    value={e1PacketDelay}
                    onChange={(e) => setE1PacketDelay(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- PAINEL DE ERROS --- */}
      {errors.length > 0 && (
        <div className="error-panel show" style={{ display: 'block', padding: '15px', border: '2px solid var(--err)', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)', marginBottom: '20px' }}>
          <div className="error-panel-title" style={{ color: 'var(--err)', fontWeight: 'bold', marginBottom: '8px' }}>
            ⚠ Corrija os seguintes campos:
          </div>
          <ul style={{ listStyle: 'none', paddingLeft: '5px' }}>
            {errors.map((err, idx) => (
              <li key={idx} style={{ color: 'var(--err)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-exclamation-circle"></i> {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- ACTION BAR --- */}
      <div className="btn-container">
        <button type="button" className="btn btn-primary" onClick={handleGenerateScript}>
          <i className="fas fa-terminal"></i>⚡ Gerar Script Completo
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleResetForm}>
          <i className="fas fa-redo"></i> Limpar tudo
        </button>
      </div>

      {/* --- OUTPUT WRAP --- */}
      {generatedScript && (
        <div className="output-wrap show" style={{ display: 'block', marginTop: '30px' }}>
          <div className="output-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', border: '2px solid var(--border)', borderBottom: 'none', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', padding: '12px 20px' }}>
            <span className="out-label" style={{ color: 'var(--success)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <i className="fas fa-check-circle"></i> Script pronto para aplicar
            </span>
            <div className="out-actions" style={{ display: 'flex', gap: '8px' }}>
              <button className="copy-btn btn-sm success" onClick={handleCopyScript} style={{ padding: '6px 12px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', border: '1px solid var(--success)', background: 'transparent', color: 'var(--success)', borderRadius: '6px' }}>
                <i className="fas fa-copy"></i> Copiar
              </button>
              <button className="dl-btn btn-sm primary" onClick={handleDownloadScript} style={{ padding: '6px 12px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: '6px' }}>
                <i className="fas fa-file-download"></i> .cfg
              </button>
            </div>
          </div>
          <div className="sensitive-warn" style={{ background: 'rgba(245, 158, 11, 0.08)', color: 'var(--warning)', padding: '10px 20px', fontSize: '12px', border: '2px solid var(--border)', borderTop: 'none', borderBottom: 'none' }}>
            ⚠ Este script contém credenciais e comunidades SNMP — manuseie com cuidado.
          </div>
          <pre
            ref={outputRef}
            id="output"
            style={{
              background: '#0a0d1a',
              color: '#a5b4fc',
              padding: '20px',
              fontFamily: 'monospace',
              fontSize: '13px',
              border: '2px solid var(--border)',
              borderBottomLeftRadius: '12px',
              borderBottomRightRadius: '12px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {generatedScript}
          </pre>
        </div>
      )}
    </div>
  );
}
