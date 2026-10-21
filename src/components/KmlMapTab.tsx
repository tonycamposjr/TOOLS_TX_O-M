import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import {
  KmlPoint,
  KmlPolyline,
  KmlParseResult,
  parseKmlContent,
  generateSampleKml,
  calculateDistanceKm
} from '../lib/kmlParser';
import {
  getCurrentKml,
  saveCurrentKml,
  getAllSavedKmls,
  deleteSavedKml,
  clearAllKmls,
  SavedKmlRecord
} from '../lib/kmlDb';

interface KmlMapTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type MapTileProvider = 'google_hybrid' | 'google_satellite' | 'google_roadmap' | 'osm';

export default function KmlMapTab({ showToast }: KmlMapTabProps) {
  // File & Parsed Data State
  const [kmlData, setKmlData] = useState<KmlParseResult | null>(null);
  const [currentRecord, setCurrentRecord] = useState<SavedKmlRecord | null>(null);
  const [savedKmlsList, setSavedKmlsList] = useState<SavedKmlRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search State
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'original' | 'name' | 'distance'>('original');
  const [mobileTab, setMobileTab] = useState<'map' | 'list' | 'both'>('both');

  const handleMobileTabChange = (mode: 'map' | 'list' | 'both') => {
    setMobileTab(mode);
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 150);
  };

  // Selected Point for details / focus
  const [selectedPoint, setSelectedPoint] = useState<KmlPoint | null>(null);

  // Saved KML Manager Modal State
  const [showSavedModal, setShowSavedModal] = useState<boolean>(false);

  // Chunked rendering progress state (for 10.000+ points without freezing UI)
  const [renderingProgress, setRenderingProgress] = useState<{ current: number; total: number; isRendering: boolean }>({
    current: 0,
    total: 0,
    isRendering: false
  });

  // Map settings & Refs
  const [tileProvider, setTileProvider] = useState<MapTileProvider>('google_hybrid');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<any>(null);
  const polylinesGroupRef = useRef<L.FeatureGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const chunkTaskRef = useRef<number | null>(null);

  // User GPS Location State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Saved KML from IndexedDB on Initial Mount
  useEffect(() => {
    async function loadPersistedKml() {
      setLoading(true);
      try {
        const saved = await getCurrentKml();
        const allSaved = await getAllSavedKmls();
        setSavedKmlsList(allSaved);

        if (saved && saved.parsedData && saved.parsedData.points) {
          setKmlData(saved.parsedData);
          setCurrentRecord(saved);
          showToast(`KML "${saved.fileName}" carregado automaticamente da memória persistente.`, 'info');
        }
      } catch (err) {
        console.error('Erro ao recarregar KML salvo:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPersistedKml();
  }, []);

  // Folders list from current KML
  const foldersList = useMemo(() => {
    if (!kmlData) return [];
    const set = new Set<string>();
    kmlData.points.forEach(p => {
      if (p.folder) set.add(p.folder);
    });
    return Array.from(set).sort();
  }, [kmlData]);

  // Filtered & Processed Points list with real-time distance and search query filtering
  const processedPoints = useMemo(() => {
    if (!kmlData) return [];
    let list = kmlData.points.map(p => {
      if (userLocation) {
        const dist = calculateDistanceKm(userLocation.lat, userLocation.lng, p.lat, p.lng);
        return { ...p, distanceKm: dist };
      }
      return p;
    });

    // Filter by Folder
    if (selectedFolder !== 'ALL') {
      list = list.filter(p => p.folder === selectedFolder);
    }

    // Filter by Search Query (real-time matching against name, description, lat, lng, folder)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        `${p.lat},${p.lng}`.includes(q) ||
        p.lat.toString().includes(q) ||
        p.lng.toString().includes(q) ||
        (p.folder && p.folder.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } else if (sortBy === 'distance' && userLocation) {
      list.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    }

    return list;
  }, [kmlData, selectedFolder, searchQuery, sortBy, userLocation]);

  // Add User Marker on Map
  const addUserMarker = (map: L.Map, lat: number, lng: number) => {
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
    }

    const userIconHtml = `
      <div style="
        background: #3b82f6;
        border: 3px solid #ffffff;
        box-shadow: 0 0 16px rgba(59, 130, 246, 0.9);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 11px;
      ">
        <i class="fas fa-street-view"></i>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userIconHtml,
      className: 'user-gps-pin',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const uMarker = L.marker([lat, lng], { icon: userIcon })
      .bindPopup('<strong>Sua Localização Atual GPS</strong>')
      .addTo(map);

    userMarkerRef.current = uMarker;
  };

  // Helper for Centroid & 50km bounds fallback (Requisito 9)
  const applyInitialMapCenterAndBounds = (map: L.Map, points: KmlPoint[]) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserLocation({ lat: latitude, lng: longitude });

          // 50km radius bounds around user location
          // 1 deg lat ~ 111km -> 50km radius = 0.45 deg
          const latDelta = 0.45;
          const lngDelta = 0.55;
          const bounds = L.latLngBounds(
            [latitude - latDelta, longitude - lngDelta],
            [latitude + latDelta, longitude + lngDelta]
          );
          map.fitBounds(bounds, { animate: true });
          addUserMarker(map, latitude, longitude);
        },
        (err) => {
          console.warn('Geolocalização não concedida ou falhou. Usando centróide KML:', err);
          fallbackToCentroid(map, points);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      fallbackToCentroid(map, points);
    }
  };

  const fallbackToCentroid = (map: L.Map, points: KmlPoint[]) => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else {
        const sumLat = points.reduce((acc, p) => acc + p.lat, 0);
        const sumLng = points.reduce((acc, p) => acc + p.lng, 0);
        map.setView([sumLat / points.length, sumLng / points.length], 10);
      }
    } else {
      // Default Brazil center fallback
      map.setView([-14.235, -51.9253], 4);
    }
  };

  // Initialize Leaflet Map and MarkerClusterer Group
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [-14.235, -51.9253],
        zoom: 4,
        maxZoom: 20,
        minZoom: 2,
        zoomControl: true
      });

      mapInstanceRef.current = map;

      // Create MarkerClusterer Group (Requisitos 1, 3 e 4)
      const clusterGroup = (L as any).markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        animate: true,
        disableClusteringAtZoom: 18,
        chunkedLoading: true
      });

      map.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;

      polylinesGroupRef.current = L.featureGroup().addTo(map);

      // Load initial tile layer
      updateMapTiles(map, tileProvider);

      // Geolocation and initial 50km bounds (Requisito 9)
      applyInitialMapCenterAndBounds(map, kmlData?.points || []);
    }

    const map = mapInstanceRef.current;
    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }

    // ResizeObserver to handle tab changes and window resize smoothly
    let resizeObserver: ResizeObserver | null = null;
    if (mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [kmlData]);

  // Handle Tile Layer Switch
  useEffect(() => {
    if (mapInstanceRef.current) {
      updateMapTiles(mapInstanceRef.current, tileProvider);
    }
  }, [tileProvider]);

  const updateMapTiles = (map: L.Map, provider: MapTileProvider) => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = '';
    let attribution = '';
    let subdomains: string[] = ['mt0', 'mt1', 'mt2', 'mt3'];

    if (provider === 'google_roadmap') {
      url = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
      attribution = '&copy; Google Maps';
    } else if (provider === 'google_satellite') {
      url = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
      attribution = '&copy; Google Maps Satellite';
    } else if (provider === 'google_hybrid') {
      url = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
      attribution = '&copy; Google Maps Hybrid';
    } else {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      subdomains = ['a', 'b', 'c'];
    }

    const newLayer = L.tileLayer(url, {
      maxZoom: 20,
      subdomains,
      attribution
    });

    newLayer.addTo(map);
    tileLayerRef.current = newLayer;
  };

  // CHUNKED MARKER RENDERING & CLUSTERER UPDATE (Requisitos 6 & 7)
  // Renders 10,000+ points in non-blocking batches of 300 points using requestAnimationFrame
  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    const polyGroup = polylinesGroupRef.current;
    if (!map || !clusterGroup) return;

    // 1. Cancel previous chunk task if running
    if (chunkTaskRef.current !== null) {
      cancelAnimationFrame(chunkTaskRef.current);
      chunkTaskRef.current = null;
    }

    // 2. Clear old markers from clusterer (Requisito 7)
    clusterGroup.clearLayers();
    if (polyGroup) polyGroup.clearLayers();

    if (processedPoints.length === 0 && (!kmlData || kmlData.polylines.length === 0)) {
      setRenderingProgress({ current: 0, total: 0, isRendering: false });
      return;
    }

    // Draw Polylines if present
    if (kmlData && kmlData.polylines.length > 0 && polyGroup) {
      kmlData.polylines.forEach(poly => {
        const polylineLayer = L.polyline(poly.coordinates, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.8
        });
        polylineLayer.bindPopup(`<strong>${poly.name}</strong>${poly.description ? `<p>${poly.description}</p>` : ''}`);
        polyGroup.addLayer(polylineLayer);
      });
    }

    const total = processedPoints.length;
    const isSearching = searchQuery.trim().length > 0;
    setRenderingProgress({ current: 0, total, isRendering: total > 200 });

    const CHUNK_SIZE = 300; // Batch size per animation frame
    let currentIndex = 0;

    const processBatch = () => {
      const batchPoints = processedPoints.slice(currentIndex, currentIndex + CHUNK_SIZE);
      const batchMarkers: L.Marker[] = [];

      batchPoints.forEach((point) => {
        const isSelected = selectedPoint?.id === point.id;

        let pinBg = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        let pinBorder = '2px solid #ffffff';
        let pinShadow = '0 4px 10px rgba(0,0,0,0.4)';
        let pinSize = 32;
        let iconClass = 'fas fa-map-marker-alt';
        let animationStyle = '';

        if (isSearching) {
          pinBg = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
          pinBorder = '3px solid #ffffff';
          pinShadow = '0 0 16px #f59e0b, 0 4px 12px rgba(0,0,0,0.5)';
          pinSize = 36;
          iconClass = 'fas fa-search-location';
          animationStyle = 'animation: pulsePin 1.5s infinite;';
        }

        if (isSelected) {
          pinBg = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
          pinBorder = '3px solid #ffffff';
          pinShadow = '0 0 20px #3b82f6';
          pinSize = 38;
        }

        const pinHtml = `
          <div style="
            background: ${pinBg};
            border: ${pinBorder};
            box-shadow: ${pinShadow};
            width: ${pinSize}px;
            height: ${pinSize}px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            ${animationStyle}
          ">
            <div style="
              transform: rotate(45deg);
              color: #ffffff;
              font-size: ${pinSize > 34 ? 15 : 13}px;
              font-weight: 800;
            ">
              <i class="${iconClass}"></i>
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: pinHtml,
          className: isSearching ? 'custom-kml-pin custom-kml-pin-searched' : 'custom-kml-pin',
          iconSize: [pinSize, pinSize],
          iconAnchor: [pinSize / 2, pinSize],
          popupAnchor: [0, -pinSize]
        });

        const marker = L.marker([point.lat, point.lng], { icon: customIcon });

        // InfoWindow Popup content (Requisito 5)
        const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
        const googleMapsWebUrl = `https://www.google.com/maps?q=${point.lat},${point.lng}`;
        const wazeUrl = `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;

        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; min-width: 240px; max-width: 280px; padding: 4px;">
            <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
              ${point.name}
            </div>
            ${point.folder ? `<div style="display: inline-block; background: #e2e8f0; color: #334155; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-bottom: 8px;"><i class="fas fa-folder"></i> ${point.folder}</div>` : ''}

            <div style="font-size: 12px; color: #475569; margin-bottom: 6px; font-family: monospace; background: #f1f5f9; padding: 4px 6px; border-radius: 4px;">
              Lat: ${point.lat.toFixed(6)} | Lng: ${point.lng.toFixed(6)}
              ${point.altitude !== undefined ? `<br>Alt: ${point.altitude}m` : ''}
              ${point.distanceKm !== undefined ? `<br><strong style="color: #059669;">Distância: ${point.distanceKm} km</strong>` : ''}
            </div>

            ${point.description ? `<div style="font-size: 12px; color: #334155; line-height: 1.4; max-height: 80px; overflow-y: auto; margin-bottom: 10px; border-left: 2px solid #059669; padding-left: 6px;">${point.description}</div>` : ''}

            <!-- Direct Google Maps Navigation Button -->
            <a href="${googleMapsNavUrl}" target="_blank" rel="noopener noreferrer" style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              background: linear-gradient(180deg, #10b981 0%, #059669 100%);
              color: #ffffff;
              font-size: 12px;
              font-weight: 700;
              padding: 8px 12px;
              border-radius: 8px;
              text-decoration: none;
              box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
              margin-bottom: 6px;
            ">
              <i class="fas fa-route"></i> NAVEGAR NO GOOGLE MAPS
            </a>

            <div style="display: flex; gap: 4px;">
              <a href="${googleMapsWebUrl}" target="_blank" rel="noopener noreferrer" style="
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                background: #2563eb;
                color: #ffffff;
                font-size: 11px;
                font-weight: 600;
                padding: 6px;
                border-radius: 6px;
                text-decoration: none;
              ">
                <i class="fas fa-map-marked-alt"></i> Ver Mapa
              </a>
              <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer" style="
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                background: #0284c7;
                color: #ffffff;
                font-size: 11px;
                font-weight: 600;
                padding: 6px;
                border-radius: 6px;
                text-decoration: none;
              ">
                <i class="fas fa-car"></i> Waze
              </a>
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml);
        marker.on('click', () => {
          setSelectedPoint(point);
        });

        batchMarkers.push(marker);
      });

      // Add batch markers to clusterer efficiently
      clusterGroup.addLayers(batchMarkers);

      currentIndex += batchPoints.length;
      setRenderingProgress({ current: currentIndex, total, isRendering: currentIndex < total });

      if (currentIndex < total) {
        chunkTaskRef.current = requestAnimationFrame(processBatch);
      } else {
        chunkTaskRef.current = null;
        // Search auto-focus
        if (isSearching) {
          if (processedPoints.length === 1) {
            const p = processedPoints[0];
            map.setView([p.lat, p.lng], 17, { animate: true });
          } else if (processedPoints.length > 1) {
            const bounds = L.latLngBounds(processedPoints.map(pt => [pt.lat, pt.lng]));
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
          }
        }
      }
    };

    processBatch();

    return () => {
      if (chunkTaskRef.current !== null) {
        cancelAnimationFrame(chunkTaskRef.current);
        chunkTaskRef.current = null;
      }
    };
  }, [processedPoints, kmlData, searchQuery, selectedPoint]);

  // Handle File Upload and Save Persistently to IndexedDB
  const handleFileUpload = (file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.kml') && !file.name.toLowerCase().endsWith('.xml') && !file.name.toLowerCase().endsWith('.gpx')) {
      showToast('Por favor, selecione um arquivo válido no formato .kml, .gpx ou .xml', 'warning');
      return;
    }

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          showToast('Arquivo KML vazio.', 'error');
          setLoading(false);
          return;
        }

        const result = parseKmlContent(text, file.name);

        if (result.points.length === 0 && result.polylines.length === 0) {
          showToast('Nenhum ponto ou rota geográfica foi encontrado no arquivo KML.', 'warning');
          setLoading(false);
          return;
        }

        // SAVE PERSISTENTLY TO INDEXEDDB
        const savedRec = await saveCurrentKml(file.name, text, result);
        const updatedList = await getAllSavedKmls();

        setKmlData(result);
        setCurrentRecord(savedRec);
        setSavedKmlsList(updatedList);
        setSelectedFolder('ALL');
        setSearchQuery('');
        setSelectedPoint(null);

        showToast(
          `KML "${file.name}" carregado e SALVO com sucesso! (${result.points.length} pontos mapeados com Clustering)`,
          'success'
        );
      } catch (err: any) {
        console.error('Erro ao ler arquivo KML:', err);
        showToast(`Erro ao processar arquivo KML: ${err.message || 'Estrutura inválida'}`, 'error');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      showToast('Erro de leitura do arquivo.', 'error');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  // Load Sample KML & Save Persistently
  const handleLoadSampleKml = async () => {
    setLoading(true);
    try {
      const sampleText = generateSampleKml();
      const fileName = 'Exemplo_POP_Telecom_SP.kml';
      const result = parseKmlContent(sampleText, fileName);

      // Save persistently
      const savedRec = await saveCurrentKml(fileName, sampleText, result);
      const updatedList = await getAllSavedKmls();

      setKmlData(result);
      setCurrentRecord(savedRec);
      setSavedKmlsList(updatedList);
      setSelectedFolder('ALL');
      setSearchQuery('');
      setSelectedPoint(null);

      showToast('KML de exemplo carregado e SALVO no navegador!', 'success');
    } catch (err) {
      console.error('Erro ao carregar amostra:', err);
      showToast('Erro ao carregar KML de exemplo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Select a Saved KML from history
  const handleSelectSavedKml = async (record: SavedKmlRecord) => {
    try {
      if (record.rawXml) {
        const reparsed = parseKmlContent(record.rawXml, record.fileName);
        const savedRec = await saveCurrentKml(record.fileName, record.rawXml, reparsed);
        setKmlData(reparsed);
        setCurrentRecord(savedRec);
      } else if (record.parsedData) {
        setKmlData(record.parsedData);
        setCurrentRecord(record);
      }
      setSelectedFolder('ALL');
      setSearchQuery('');
      setSelectedPoint(null);
      setShowSavedModal(false);

      showToast(`KML "${record.fileName}" selecionado!`, 'success');
    } catch (err) {
      console.error('Erro ao carregar KML salvo:', err);
      showToast('Erro ao carregar KML do histórico.', 'error');
    }
  };

  // Delete a Saved KML from history
  const handleDeleteSavedKml = async (id: number) => {
    try {
      await deleteSavedKml(id);
      const updatedList = await getAllSavedKmls();
      setSavedKmlsList(updatedList);

      if (currentRecord?.id === id) {
        if (updatedList.length > 0) {
          handleSelectSavedKml(updatedList[0]);
        } else {
          setKmlData(null);
          setCurrentRecord(null);
        }
      }

      showToast('KML removido da memória.', 'info');
    } catch (err) {
      console.error('Erro ao deletar KML:', err);
    }
  };

  // Clear all saved KMLs
  const handleClearAllKmls = async () => {
    if (window.confirm('Deseja realmente limpar todos os arquivos KML salvos no navegador?')) {
      await clearAllKmls();
      setSavedKmlsList([]);
      setKmlData(null);
      setCurrentRecord(null);
      setSelectedPoint(null);
      setShowSavedModal(false);
      showToast('Todos os KMLs salvos foram removidos.', 'info');
    }
  };

  // Request User GPS Location
  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocalização não é suportada por este navegador.', 'error');
      return;
    }

    setGpsLoading(true);
    showToast('Obtendo sua localização GPS...', 'info');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setGpsLoading(false);
        showToast('Sua localização GPS foi obtida!', 'success');

        const map = mapInstanceRef.current;
        if (map) {
          addUserMarker(map, latitude, longitude);
          map.setView([latitude, longitude], 14, { animate: true });
        }
      },
      (err) => {
        setGpsLoading(false);
        console.error('Erro de GPS:', err);
        showToast('Não foi possível obter sua localização GPS. Verifique a permissão.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Focus a specific point on the map manually when clicked on the list
  const handleFocusPoint = (point: KmlPoint) => {
    setSelectedPoint(point);
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([point.lat, point.lng], 17, { animate: true });

      // Open marker popup using MarkerClusterer spiderfy logic if needed
      const clusterGroup = clusterGroupRef.current;
      if (clusterGroup) {
        clusterGroup.eachLayer((layer: any) => {
          if (layer.getLatLng) {
            const latLng = layer.getLatLng();
            if (Math.abs(latLng.lat - point.lat) < 0.0001 && Math.abs(latLng.lng - point.lng) < 0.0001) {
              clusterGroup.zoomToShowLayer(layer, () => {
                layer.openPopup();
              });
            }
          }
        });
      }
    }
  };

  // Copy coordinates to clipboard
  const handleCopyCoords = (lat: number, lng: number) => {
    const text = `${lat}, ${lng}`;
    navigator.clipboard.writeText(text);
    showToast(`Coordenadas ${text} copiadas!`, 'success');
  };

  // Export parsed points to CSV
  const handleExportCsv = () => {
    if (!kmlData || kmlData.points.length === 0) return;

    let csvContent = 'NOME;PASTA;LATITUDE;LONGITUDE;ALTITUDE;DESCRICAO;LINK_NAVEGACAO_GOOGLE_MAPS\n';

    kmlData.points.forEach(p => {
      const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
      const nameEscaped = `"${p.name.replace(/"/g, '""')}"`;
      const folderEscaped = `"${(p.folder || '').replace(/"/g, '""')}"`;
      const descEscaped = `"${p.description.replace(/"/g, '""')}"`;

      csvContent += `${nameEscaped};${folderEscaped};${p.lat};${p.lng};${p.altitude || ''};${descEscaped};${navUrl}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kmlData.fileName.replace(/\.kml$/i, '')}_pontos.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Pontos exportados para CSV com sucesso!', 'success');
  };

  return (
    <div className="database-container kml-tab-container">
      {/* Header */}
      <div className="db-header">
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <i className="fas fa-map-marked-alt" style={{ color: 'var(--accent)' }}></i> Consulta KML de Alta Performance (Marker Clustering)
        </h2>
        <p className="db-subtitle">
          Renderização otimizada para mais de 10.000 pontos com agrupamento em tempo real (Clustering) e navegação direta para o Google Maps.
        </p>
      </div>

      {/* Upload Zone Card when no active KML */}
      {!kmlData && !loading && (
        <div className="filters-container" style={{ textAlign: 'center', padding: '35px 20px', marginBottom: '25px' }}>
          <div
            style={{
              border: '2px dashed var(--accent)',
              borderRadius: '16px',
              padding: '40px 20px',
              background: 'var(--card)',
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              maxWidth: '650px',
              margin: '0 auto'
            }}
            onClick={() => !loading && fileInputRef.current?.click()}
          >
            <i className="fas fa-file-code" style={{ fontSize: '56px', color: 'var(--accent)', marginBottom: '15px' }}></i>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--fg)', marginBottom: '8px' }}>
              {loading ? 'Carregando KML...' : 'Clique para selecionar ou arraste seu arquivo .KML aqui'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px' }}>
              O arquivo será <strong style={{ color: 'var(--success)' }}>salvo de forma permanente no navegador</strong> e renderizado em lotes com Marker Clustering.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={loading}>
                <i className="fas fa-upload"></i> Enviar Arquivo KML
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadSampleKml();
                }}
              >
                <i className="fas fa-vial"></i> Testar com KML de Exemplo
              </button>

              {savedKmlsList.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSavedModal(true);
                  }}
                >
                  <i className="fas fa-history"></i> KMLs Salvos ({savedKmlsList.length})
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".kml,.xml,.gpx"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Active KML Summary & Persistence Status Bar */}
      {kmlData && (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '15px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}
            >
              <i className="fas fa-database"></i>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--fg)' }}>
                  {kmlData.fileName}
                </h3>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: 'var(--success)',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <i className="fas fa-shield-alt"></i> Salvo (Clustering Ativo)
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                <strong>{kmlData.points.length}</strong> pontos mapeados
                {kmlData.polylines.length > 0 && ` • ${kmlData.polylines.length} rotas/linhas`}
                {currentRecord?.updatedAt && ` • Atualizado em: ${currentRecord.updatedAt}`}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="db-btn primary"
              style={{ fontSize: '12px', padding: '8px 12px' }}
              onClick={handleGetGpsLocation}
              disabled={gpsLoading}
            >
              <i className="fas fa-crosshairs"></i> {userLocation ? 'GPS Ativo' : 'Minha Localização GPS'}
            </button>

            {savedKmlsList.length > 0 && (
              <button
                className="db-btn secondary"
                style={{ fontSize: '12px', padding: '8px 12px' }}
                onClick={() => setShowSavedModal(true)}
              >
                <i className="fas fa-folder"></i> Meus KMLs Salvos ({savedKmlsList.length})
              </button>
            )}

            <button
              className="db-btn secondary"
              style={{ fontSize: '12px', padding: '8px 12px' }}
              onClick={handleExportCsv}
            >
              <i className="fas fa-download"></i> Exportar CSV
            </button>
            <button
              className="db-btn secondary"
              style={{ fontSize: '12px', padding: '8px 12px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="fas fa-upload"></i> Novo KML
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar during Chunked Batch Rendering for large datasets */}
      {renderingProgress.isRendering && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: '10px', padding: '12px 16px', marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: 'var(--fg)', marginBottom: '6px' }}>
            <span><i className="fas fa-spinner fa-spin" style={{ color: 'var(--accent)' }}></i> Agrupando pontos no mapa em lotes...</span>
            <span>{renderingProgress.current.toLocaleString()} / {renderingProgress.total.toLocaleString()} ({Math.round((renderingProgress.current / renderingProgress.total) * 100)}%)</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(renderingProgress.current / renderingProgress.total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #3b82f6)', transition: 'width 0.1s ease' }}></div>
          </div>
        </div>
      )}

      {/* Main Grid: Real-Time Map + Points List */}
      {kmlData && (
        <>
          {/* Mobile View Mode Switcher */}
          <div className="mobile-view-switcher" style={{ display: 'none', marginBottom: '12px' }}>
            <button
              type="button"
              className={`mobile-tab-btn ${mobileTab === 'map' ? 'active' : ''}`}
              onClick={() => handleMobileTabChange('map')}
            >
              <i className="fas fa-map-marked-alt"></i> Mapa
            </button>
            <button
              type="button"
              className={`mobile-tab-btn ${mobileTab === 'list' ? 'active' : ''}`}
              onClick={() => handleMobileTabChange('list')}
            >
              <i className="fas fa-list-ol"></i> Lista ({processedPoints.length})
            </button>
            <button
              type="button"
              className={`mobile-tab-btn ${mobileTab === 'both' ? 'active' : ''}`}
              onClick={() => handleMobileTabChange('both')}
            >
              <i className="fas fa-columns"></i> Ambos
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', minHeight: '580px' }} className="kml-main-layout">
            {/* Left Column: Map Container */}
            <div 
              style={{ 
                display: mobileTab === 'list' ? 'none' : 'flex', 
                flexDirection: 'column', 
                gap: '12px' 
              }}
            >
              {/* Tile Provider Controls Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--card)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-layer-group" style={{ color: 'var(--accent)' }}></i> Camada do Mapa:
                </span>

                <div className="view-mode-selector" style={{ margin: 0 }}>
                  <button
                    className={`view-mode-btn ${tileProvider === 'google_hybrid' ? 'active' : ''}`}
                    onClick={() => setTileProvider('google_hybrid')}
                  >
                    Google Híbrido
                  </button>
                  <button
                    className={`view-mode-btn ${tileProvider === 'google_satellite' ? 'active' : ''}`}
                    onClick={() => setTileProvider('google_satellite')}
                  >
                    Satélite
                  </button>
                  <button
                    className={`view-mode-btn ${tileProvider === 'google_roadmap' ? 'active' : ''}`}
                    onClick={() => setTileProvider('google_roadmap')}
                  >
                    Google Vias
                  </button>
                  <button
                    className={`view-mode-btn ${tileProvider === 'osm' ? 'active' : ''}`}
                    onClick={() => setTileProvider('osm')}
                  >
                    OpenStreetMap
                  </button>
                </div>
              </div>

              {/* Map Element */}
              <div
                ref={mapContainerRef}
                className={mobileTab === 'map' ? 'mobile-map-fullscreen' : ''}
                style={{
                  width: '100%',
                  height: mobileTab === 'map' ? 'min(620px, calc(100vh - 200px))' : '520px',
                  borderRadius: '12px',
                  border: '2px solid var(--border)',
                  boxShadow: '0 4px 12px var(--shadow)',
                  zIndex: 1
                }}
              />
            </div>

            {/* Right Column: Search, Filter & Point List */}
            <div
              className={mobileTab === 'list' ? 'mobile-list-fullscreen' : ''}
              style={{
                display: mobileTab === 'map' ? 'none' : 'flex',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px',
                flexDirection: 'column',
                maxHeight: mobileTab === 'list' ? 'calc(100vh - 200px)' : '575px',
                overflow: 'hidden'
              }}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-list-ol" style={{ color: 'var(--accent)' }}></i>
                Pontos ({processedPoints.length} de {kmlData.points.length})
              </h4>

              {searchQuery && (
                <button
                  type="button"
                  style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedPoint(null);
                  }}
                >
                  <i className="fas fa-times"></i> Limpar busca
                </button>
              )}
            </div>

            {/* REAL-TIME SEARCH INPUT */}
            <div className="search-box" style={{ minWidth: '100%', marginBottom: '10px' }}>
              <i className="fas fa-search" style={{ color: searchQuery ? '#f59e0b' : undefined }}></i>
              <input
                type="text"
                placeholder="Buscar ponto em tempo real..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 12px 8px 36px',
                  fontSize: '12px',
                  borderColor: searchQuery ? '#f59e0b' : undefined,
                  boxShadow: searchQuery ? '0 0 8px rgba(245, 158, 11, 0.4)' : undefined
                }}
              />
            </div>

            {/* Folder Filter Dropdown */}
            {foldersList.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  style={{ width: '100%', fontSize: '12px', padding: '6px 10px' }}
                >
                  <option value="ALL">Todas as Pastas ({foldersList.length})</option>
                  {foldersList.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Sorting */}
            {userLocation && (
              <div style={{ marginBottom: '10px' }}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  style={{ width: '100%', fontSize: '12px', padding: '6px 10px' }}
                >
                  <option value="original">Ordem Original do KML</option>
                  <option value="name">Ordem Alfabética</option>
                  <option value="distance">Mais Próximos da Minha Localização GPS</option>
                </select>
              </div>
            )}

            {/* Points Scrollable List */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {processedPoints.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>
                  <i className="fas fa-search-minus" style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.5 }}></i>
                  <p style={{ fontSize: '12px', margin: 0 }}>Nenhum ponto encontrado para "{searchQuery}".</p>
                </div>
              )}

              {processedPoints.slice(0, 500).map((p) => {
                const isSelected = selectedPoint?.id === p.id;
                const googleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleFocusPoint(p)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #3b82f6' : searchQuery ? '1px solid #f59e0b' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.15)' : searchQuery ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--fg)', lineHeight: '1.3' }}>
                        {p.name}
                      </strong>
                      {p.distanceKm !== undefined && (
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--success)', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          {p.distanceKm} km
                        </span>
                      )}
                    </div>

                    {p.folder && (
                      <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                        <i className="fas fa-folder"></i> {p.folder}
                      </span>
                    )}

                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--muted)', marginBottom: '8px' }}>
                      {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    </div>

                    {/* Quick Direct Navigation Button */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <a
                        href={googleNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '5px 8px',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          boxShadow: '0 2px 5px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <i className="fas fa-directions"></i> NAVEGAR (MAPS)
                      </a>

                      <button
                        type="button"
                        className="action-btn"
                        style={{ padding: '4px 8px' }}
                        title="Copiar Coordenadas"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCoords(p.lat, p.lng);
                        }}
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>
                );
              })}

              {processedPoints.length > 500 && (
                <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--muted)', padding: '8px' }}>
                  Exibindo os primeiros 500 itens na lista. Use a busca acima para filtrar pontos específicos no mapa.
                </div>
              )}
            </div>
          </div>
        </div>
      </>
      )}

      {/* MODAL: MEUS KMLS SALVOS */}
      {showSavedModal && (
        <div className="modal-overlay" onClick={() => setShowSavedModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '560px', width: '90%', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-database" style={{ color: 'var(--accent)' }}></i> Meus Arquivos KML Salvos
              </h3>
              <button
                type="button"
                className="action-btn"
                onClick={() => setShowSavedModal(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
              Estes arquivos estão armazenados localmente na memória do seu navegador. Clique em um KML para carregá-lo no mapa.
            </p>

            {savedKmlsList.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>
                Nenhum arquivo KML salvo na memória.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto', marginBottom: '20px' }}>
                {savedKmlsList.map((rec) => {
                  const isCurrent = currentRecord?.id === rec.id;
                  const ptsCount = rec.parsedData?.points?.length || 0;

                  return (
                    <div
                      key={rec.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: isCurrent ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '14px', color: 'var(--fg)' }}>{rec.fileName}</strong>
                          {isCurrent && (
                            <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>
                              EM USO
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {ptsCount} pontos • Salvo em {rec.updatedAt}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!isCurrent && (
                          <button
                            type="button"
                            className="db-btn primary"
                            style={{ fontSize: '11px', padding: '6px 10px' }}
                            onClick={() => handleSelectSavedKml(rec)}
                          >
                            Carregar
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-btn"
                          style={{ color: 'var(--danger)', padding: '6px 10px' }}
                          title="Excluir KML"
                          onClick={() => rec.id && handleDeleteSavedKml(rec.id)}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              {savedKmlsList.length > 0 && (
                <button
                  type="button"
                  className="db-btn danger"
                  style={{ fontSize: '12px' }}
                  onClick={handleClearAllKmls}
                >
                  <i className="fas fa-trash-alt"></i> Limpar Todos os KMLs
                </button>
              )}

              <button
                type="button"
                className="db-btn secondary"
                style={{ fontSize: '12px', marginLeft: 'auto' }}
                onClick={() => setShowSavedModal(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
