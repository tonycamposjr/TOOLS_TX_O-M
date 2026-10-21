import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { RotaHL4Item } from '../types';

interface RotasHl4TabProps {
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface PendingPNGFile {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  originalSizeFormatted: string;
  optimizedSizeFormatted?: string;
  dimensions?: string;
  blob?: Blob;
  optimizedDataUrl?: string;
  status: 'pending' | 'processing' | 'uploading' | 'done' | 'error';
  progress: number;
  errorMessage?: string;
}

export default function RotasHl4Tab({ showToast }: RotasHl4TabProps) {
  const [rotas, setRotas] = useState<RotaHL4Item[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingPNGFile[]>([]);
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Fullscreen Preview Modal State
  const [selectedImage, setSelectedImage] = useState<{ url: string; title: string; date?: string } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Format Bytes to human readable string
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper: Optimize and resize PNG before uploading/saving to Firestore & Storage
  const optimizePNG = (file: File): Promise<{
    blob: Blob;
    dataUrl: string;
    dimensions: string;
    optimizedSizeFormatted: string;
  }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 1600;
          const maxHeight = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Não foi possível inicializar o Canvas 2D.'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Generate compressed data URL safe for storing directly inside Firestore (<300KB)
          let dataUrl = canvas.toDataURL('image/png');
          if (dataUrl.length > 350000) {
            dataUrl = canvas.toDataURL('image/webp', 0.85);
            if (dataUrl.length > 350000) {
              dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            }
          }

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({
                  blob,
                  dataUrl,
                  dimensions: `${width} × ${height} px`,
                  optimizedSizeFormatted: formatFileSize(blob.size),
                });
              } else {
                const binary = atob(dataUrl.split(',')[1]);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  array[i] = binary.charCodeAt(i);
                }
                const fallbackBlob = new Blob([array], { type: 'image/png' });
                resolve({
                  blob: fallbackBlob,
                  dataUrl,
                  dimensions: `${width} × ${height} px`,
                  optimizedSizeFormatted: formatFileSize(fallbackBlob.size),
                });
              }
            },
            'image/png'
          );
        };

        img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error('Erro ao ler o arquivo PNG.'));
      reader.readAsDataURL(file);
    });
  };

  // Firestore Realtime Listener
  useEffect(() => {
    const collectionPath = 'rotas_hl4';
    const unsubscribe = onSnapshot(
      collection(db, collectionPath),
      (snapshot) => {
        const items: RotaHL4Item[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            nome: data.nome || 'Rota sem nome',
            url: data.url || data.dataUrl || '',
            storagePath: data.storagePath || '',
            enviadoEm: data.enviadoEm || new Date().toISOString(),
            dataUrl: data.dataUrl || '',
            tamanho: data.tamanho || '',
            dimensoes: data.dimensoes || '',
          });
        });
        // Ordena por data mais recente
        items.sort((a, b) => (b.enviadoEm > a.enviadoEm ? 1 : -1));
        setRotas(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      }
    );

    return () => unsubscribe();
  }, []);

  // Global Clipboard Paste Listener for PNGs
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const timeStr = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
            const pastedFile = new File([file], `Captura_PNG_${timeStr}.png`, { type: 'image/png' });
            imageFiles.push(pastedFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        addFilesToPending(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Process incoming files & add to pending queue
  const addFilesToPending = async (filesList: FileList | File[]) => {
    const newItems: PendingPNGFile[] = [];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.png')) {
        showToast?.(`O arquivo ${file.name} não é uma imagem PNG válida.`, 'warning');
        continue;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const previewUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");

      const pendingItem: PendingPNGFile = {
        id,
        file,
        previewUrl,
        name: cleanName,
        originalSizeFormatted: formatFileSize(file.size),
        status: 'pending',
        progress: 0,
      };

      newItems.push(pendingItem);
    }

    if (newItems.length > 0) {
      setPendingFiles((prev) => [...prev, ...newItems]);
      showToast?.(`${newItems.length} imagem(ns) PNG adicionada(s) à pré-exibição flutuante.`, 'info');

      // Pre-process and optimize in background
      for (const item of newItems) {
        try {
          const opt = await optimizePNG(item.file);
          setPendingFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? {
                    ...f,
                    blob: opt.blob,
                    optimizedDataUrl: opt.dataUrl,
                    dimensions: opt.dimensions,
                    optimizedSizeFormatted: opt.optimizedSizeFormatted,
                  }
                : f
            )
          );
        } catch (err) {
          console.warn('Erro na pré-otimização do PNG:', err);
        }
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToPending(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToPending(e.dataTransfer.files);
    }
  };

  // Update pending file custom name
  const updatePendingName = (id: string, newName: string) => {
    setPendingFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: newName } : f))
    );
  };

  // Remove single pending file
  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return filtered;
    });
  };

  // Clear all pending queue
  const clearAllPending = () => {
    pendingFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setPendingFiles([]);
    showToast?.('Pré-exibição limpa.', 'info');
  };

  // Execute Upload Batch for all Pending Files
  const handleUploadAllPending = async () => {
    if (pendingFiles.length === 0) return;

    setIsUploadingBatch(true);
    let successCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const item = pendingFiles[i];
      if (item.status === 'done') continue;

      setPendingFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', progress: 30 } : f))
      );

      try {
        let blob = item.blob;
        let dataUrl = item.optimizedDataUrl;
        let dimensionsStr = item.dimensions;

        if (!blob || !dataUrl) {
          setPendingFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, progress: 50 } : f))
          );
          const opt = await optimizePNG(item.file);
          blob = opt.blob;
          dataUrl = opt.dataUrl;
          dimensionsStr = opt.dimensions;
        }

        setPendingFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, progress: 75 } : f))
        );

        const timestamp = Date.now();
        const safeName = item.name.trim() || 'Rota_PNG';
        const fileName = safeName.toLowerCase().endsWith('.png') ? safeName : `${safeName}.png`;
        const storagePath = `rotas-hl4/${timestamp}-${fileName}`;
        const storageRef = ref(storage, storagePath);

        let finalDownloadUrl = '';
        let finalStoragePath = storagePath;

        // Try Firebase Storage upload first
        try {
          await uploadBytes(storageRef, blob);
          finalDownloadUrl = await getDownloadURL(storageRef);
        } catch (storageErr) {
          console.warn('Firebase Storage offline, utilizando DataURL otimizada:', storageErr);
          finalDownloadUrl = dataUrl;
          finalStoragePath = '';
        }

        // Save record directly in Firestore Database for instant access across all devices
        const collectionPath = 'rotas_hl4';
        await addDoc(collection(db, collectionPath), {
          nome: fileName,
          url: finalDownloadUrl || dataUrl,
          storagePath: finalStoragePath,
          dataUrl: dataUrl || '',
          tamanho: item.optimizedSizeFormatted || item.originalSizeFormatted || '',
          dimensoes: dimensionsStr || '',
          enviadoEm: new Date().toISOString(),
        });

        setPendingFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'done', progress: 100 } : f))
        );
        successCount++;
      } catch (err: any) {
        console.error('Erro ao enviar PNG:', err);
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'error', progress: 0, errorMessage: err.message || 'Falha ao salvar' }
              : f
          )
        );
      }
    }

    setIsUploadingBatch(false);

    if (successCount > 0) {
      showToast?.(`${successCount} arquivo(s) PNG enviado(s) e salvo(s) com sucesso!`, 'success');
      setTimeout(() => {
        setPendingFiles((prev) => prev.filter((f) => f.status !== 'done'));
      }, 1000);
    } else {
      showToast?.('Ocorreu um erro ao enviar os arquivos PNG.', 'error');
    }
  };

  // Delete saved PNG item
  const handleDeleteSaved = async (item: RotaHL4Item) => {
    if (!confirm(`Deseja realmente excluir a rota PNG "${item.nome}"?`)) return;

    try {
      if (item.storagePath) {
        const fileRef = ref(storage, item.storagePath);
        await deleteObject(fileRef).catch((err) => {
          console.warn('Registro no Storage já havia sido excluído ou inacessível:', err);
        });
      }

      const collectionPath = 'rotas_hl4';
      await deleteDoc(doc(db, collectionPath, item.id));
      showToast?.('PNG excluído com sucesso.', 'info');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      showToast?.('Erro ao excluir o registro PNG.', 'error');
    }
  };

  // Download saved PNG file directly
  const handleDownloadPNG = (item: RotaHL4Item) => {
    try {
      const link = document.createElement('a');
      link.href = item.url;
      link.download = item.nome.endsWith('.png') ? item.nome : `${item.nome}.png`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast?.(`Iniciando download de ${item.nome}...`, 'info');
    } catch (err) {
      console.error('Erro ao baixar PNG:', err);
      showToast?.('Erro ao baixar arquivo PNG.', 'error');
    }
  };

  // Copy PNG image URL to clipboard
  const handleCopyLink = (url: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => showToast?.('Link da imagem copiado com sucesso!', 'success'))
        .catch(() => showToast?.('Erro ao copiar link.', 'error'));
    } else {
      showToast?.('Recurso de cópia não suportado neste navegador.', 'warning');
    }
  };

  // Filtered Rotas
  const filteredRotas = rotas.filter((r) =>
    r.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        minHeight: '82vh',
        padding: '24px',
        borderRadius: '20px',
        color: '#f8fafc',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 800,
              margin: 0,
              color: '#ffffff',
              letterSpacing: '-0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <i className="fas fa-route" style={{ color: '#818cf8' }}></i> Rotas HL4 & Mapas PNG
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Upload otimizado de imagens PNG de alta resolução com pré-exibição em cards flutuantes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700,
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          >
            <i className="fas fa-image"></i> {rotas.length} PNGs Salvos
          </span>
        </div>
      </div>

      {/* DRAG & DROP ZONE FLUTUANTE */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed #818cf8' : '2px dashed rgba(255, 255, 255, 0.2)',
          background: isDragging
            ? 'rgba(99, 102, 241, 0.12)'
            : 'rgba(30, 41, 59, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '16px',
          padding: '28px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '28px',
          transition: 'all 0.25s ease',
          boxShadow: isDragging ? '0 0 25px rgba(99, 102, 241, 0.3)' : 'none',
        }}
      >
        <input
          type="file"
          accept="image/png,image/*,.png,.PNG"
          multiple
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(129, 140, 248, 0.1))',
            color: '#818cf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            margin: '0 auto 14px auto',
            border: '1px solid rgba(129, 140, 248, 0.3)',
          }}
        >
          <i className="fas fa-cloud-upload-alt"></i>
        </div>

        <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
          Arraste e solte seus arquivos PNG aqui
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          ou <span style={{ color: '#818cf8', fontWeight: 600, textDecoration: 'underline' }}>clique para navegar</span> no seu dispositivo. Você também pode colar com <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl + V</kbd>
        </p>
      </div>

      {/* SEÇÃO DE PRÉ-EXIBIÇÃO EM CARDS FLUTUANTES (PENDING FILES) */}
      {pendingFiles.length > 0 && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(129, 140, 248, 0.4)',
            borderRadius: '20px',
            padding: '20px',
            marginBottom: '32px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          {/* Header da Pré-Exibição */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-layer-group" style={{ color: '#818cf8', fontSize: '20px' }}></i>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                Pré-Exibição Flutuante ({pendingFiles.length} arquivo(s))
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={clearAllPending}
                disabled={isUploadingBatch}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isUploadingBatch ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fas fa-times"></i> Cancelar Todos
              </button>

              <button
                onClick={handleUploadAllPending}
                disabled={isUploadingBatch}
                style={{
                  background: isUploadingBatch
                    ? 'rgba(99, 102, 241, 0.4)'
                    : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isUploadingBatch ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 20px rgba(79, 70, 229, 0.4)',
                }}
              >
                <i className={isUploadingBatch ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane'}></i>
                {isUploadingBatch ? 'Enviando Imagens...' : `Confirmar Envio (${pendingFiles.length})`}
              </button>
            </div>
          </div>

          {/* Grade de Cards Flutuantes de Pré-Exibição */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {pendingFiles.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: '14px',
                  border: item.status === 'error'
                    ? '1px solid rgba(239, 68, 68, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  position: 'relative',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)',
                }}
              >
                {/* Imagem Thumbnail */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#000000',
                  }}
                >
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />

                  {/* Botão de Remover Card Individual */}
                  <button
                    onClick={() => removePendingFile(item.id)}
                    disabled={isUploadingBatch}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Remover da lista"
                  >
                    ✕
                  </button>
                </div>

                {/* Input para Editar Nome da Rota */}
                <div>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#94a3b8',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Nome da Rota PNG:
                  </label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updatePendingName(item.id, e.target.value)}
                    disabled={isUploadingBatch}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      fontWeight: 600,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Detalhes de Tamanho e Resolução */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '11px',
                    color: '#cbd5e1',
                  }}
                >
                  <span>
                    <i className="fas fa-ruler-combined" style={{ color: '#818cf8' }}></i>{' '}
                    {item.dimensions || 'Calculando...'}
                  </span>
                  <span>
                    <i className="fas fa-weight-hanging" style={{ color: '#34d399' }}></i>{' '}
                    {item.optimizedSizeFormatted || item.originalSizeFormatted}
                  </span>
                </div>

                {/* Barra de Progresso / Status */}
                {item.status === 'uploading' && (
                  <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${item.progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #6366f1, #34d399)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}

                {item.status === 'done' && (
                  <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fas fa-check-circle"></i> Enviado com Sucesso!
                  </span>
                )}

                {item.status === 'error' && (
                  <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600 }}>
                    <i className="fas fa-exclamation-triangle"></i> {item.errorMessage || 'Erro'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BARRA DE PESQUISA & CONTROLES DOS PNGS SALVOS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          background: 'rgba(30, 41, 59, 0.4)',
          padding: '12px 18px',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <i
            className="fas fa-search"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '13px',
            }}
          ></i>
          <input
            type="text"
            placeholder="Filtrar rotas PNG salvas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              background: viewMode === 'grid' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            title="Exibição em Cards Flutuantes"
          >
            <i className="fas fa-th-large"></i> Cards
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              background: viewMode === 'list' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            title="Exibição em Lista Compacta"
          >
            <i className="fas fa-list"></i> Lista
          </button>
        </div>
      </div>

      {/* GALERIA DE CARDS FLUTUANTES DOS PNGS SALVOS */}
      {filteredRotas.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '16px',
            border: '1px dashed rgba(255, 255, 255, 0.1)',
          }}
        >
          <i className="fas fa-images" style={{ fontSize: '42px', color: '#475569', marginBottom: '12px' }}></i>
          <p style={{ color: '#94a3b8', fontSize: '15px', margin: 0 }}>
            {searchTerm ? 'Nenhuma rota PNG encontrada para este filtro.' : 'Nenhum arquivo PNG salvo ainda. Arraste ou selecione arquivos acima para começar.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Modo Cards Flutuantes */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredRotas.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                transition: 'transform 0.25s ease, box-shadow 0.25s ease',
              }}
            >
              {/* Badge de Data e Status do Banco de Dados */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    background: 'rgba(15, 23, 42, 0.6)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <i className="far fa-clock"></i>{' '}
                  {new Date(item.enviadoEm).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(item.enviadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>

                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#34d399',
                    background: 'rgba(52, 211, 153, 0.12)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(52, 211, 153, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Imagem salva no Firestore Database e sincronizada com todos os dispositivos"
                >
                  <i className="fas fa-database"></i> Salvo no Banco
                </span>
              </div>

              {/* Box de Imagem Thumbnail com Zoom no Clique */}
              <div
                onClick={() => setSelectedImage({ url: item.url || item.dataUrl || '', title: item.nome, date: item.enviadoEm })}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '170px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#000000',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <img
                  src={item.url || item.dataUrl}
                  alt={item.nome}
                  onError={(e) => {
                    if (item.dataUrl && e.currentTarget.src !== item.dataUrl) {
                      e.currentTarget.src = item.dataUrl;
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transition: 'transform 0.3s ease',
                  }}
                />
                
                {/* Overlay ao passar o mouse */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                >
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.9)',
                      color: '#ffffff',
                      padding: '8px 16px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 700,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}
                  >
                    <i className="fas fa-search-plus"></i> Ampliar
                  </span>
                </div>
              </div>

              {/* Título da Rota PNG e Dimensões */}
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={item.nome}
                >
                  {item.nome}
                </h4>
                {(item.dimensoes || item.tamanho) && (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    {item.dimensoes && <span><i className="fas fa-ruler-combined" style={{ color: '#818cf8' }}></i> {item.dimensoes}</span>}
                    {item.tamanho && <span><i className="fas fa-weight-hanging" style={{ color: '#34d399' }}></i> {item.tamanho}</span>}
                  </div>
                )}
              </div>

              {/* Ações do Card Flutuante */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: 'auto',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <button
                  onClick={() => setSelectedImage({ url: item.url, title: item.nome, date: item.enviadoEm })}
                  style={{
                    flex: 1,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  title="Ver em Tela Cheia"
                >
                  <i className="fas fa-expand"></i> Ver
                </button>

                <button
                  onClick={() => handleDownloadPNG(item)}
                  style={{
                    flex: 1,
                    background: 'rgba(52, 211, 153, 0.15)',
                    color: '#6ee7b7',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  title="Baixar Arquivo PNG"
                >
                  <i className="fas fa-download"></i> Baixar
                </button>

                <button
                  onClick={() => handleCopyLink(item.url)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title="Copiar Link"
                >
                  <i className="fas fa-link"></i>
                </button>

                <button
                  onClick={() => handleDeleteSaved(item)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#fca5a5',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title="Excluir Rota PNG"
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Modo Lista Compacta */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredRotas.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px', flex: 1 }}>
                <img
                  src={item.url || item.dataUrl}
                  alt={item.nome}
                  onError={(e) => {
                    if (item.dataUrl && e.currentTarget.src !== item.dataUrl) {
                      e.currentTarget.src = item.dataUrl;
                    }
                  }}
                  onClick={() => setSelectedImage({ url: item.url || item.dataUrl || '', title: item.nome, date: item.enviadoEm })}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    cursor: 'pointer',
                  }}
                />
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{item.nome}</h4>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {new Date(item.enviadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setSelectedImage({ url: item.url, title: item.nome, date: item.enviadoEm })}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-eye"></i> Ver
                </button>
                <button
                  onClick={() => handleDownloadPNG(item)}
                  style={{
                    background: 'rgba(52, 211, 153, 0.15)',
                    color: '#6ee7b7',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-download"></i> Baixar
                </button>
                <button
                  onClick={() => handleDeleteSaved(item)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#fca5a5',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-trash-alt"></i> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL FULLSCREEN COM CONTROLES DE ZOOM E DOWNLOAD */}
      {selectedImage && (
        <div
          onClick={() => {
            setSelectedImage(null);
            setZoomLevel(1);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          {/* Header do Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              right: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10,
              background: 'rgba(30, 41, 59, 0.8)',
              backdropFilter: 'blur(12px)',
              padding: '12px 20px',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                {selectedImage.title}
              </h3>
              {selectedImage.date && (
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Enviado em {new Date(selectedImage.date).toLocaleString('pt-BR')}
                </span>
              )}
            </div>

            {/* Ações do Modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setZoomLevel((z) => Math.min(z + 0.3, 3))}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                title="Zoom In"
              >
                <i className="fas fa-search-plus"></i>
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.max(z - 0.3, 0.5))}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                title="Zoom Out"
              >
                <i className="fas fa-search-minus"></i>
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                title="Reset Zoom"
              >
                1:1
              </button>

              <button
                onClick={() =>
                  handleDownloadPNG({
                    id: '',
                    nome: selectedImage.title,
                    url: selectedImage.url,
                    storagePath: '',
                    enviadoEm: '',
                  })
                }
                style={{
                  background: '#34d399',
                  color: '#0f172a',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fas fa-download"></i> Baixar
              </button>

              <button
                onClick={() => {
                  setSelectedImage(null);
                  setZoomLevel(1);
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.8)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Área da Imagem Ampliada */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '82vh',
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '60px',
            }}
          >
            <img
              src={selectedImage.url}
              alt={selectedImage.title}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '12px',
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s ease-out',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
