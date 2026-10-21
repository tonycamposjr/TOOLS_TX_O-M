export interface KmlPoint {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  altitude?: number;
  folder?: string;
  rawCoordinates: string;
  distanceKm?: number;
}

export interface KmlPolyline {
  id: string;
  name: string;
  description: string;
  coordinates: [number, number][]; // [lat, lng]
}

export interface KmlParseResult {
  fileName: string;
  points: KmlPoint[];
  polylines: KmlPolyline[];
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

/**
 * Funçao para extrair texto limpo do HTML ou CDATA de descrição do KML
 */
export function cleanDescription(rawHtml: string): string {
  if (!rawHtml) return '';
  // Se contiver tags HTML, podemos converter/limpar
  const tmp = document.createElement('DIV');
  tmp.innerHTML = rawHtml;
  const text = tmp.textContent || tmp.innerText || '';
  return text.trim();
}

/**
 * Calcula a distância Haversine em km entre dois pontos geográficos
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Parser KML robusto usando DOMParser XML nativo do navegador
 */
export function parseKmlContent(xmlString: string, fileName: string): KmlParseResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Verificar se houve erro de parse XML
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('O arquivo enviado não possui uma estrutura XML/KML válida.');
  }

  const points: KmlPoint[] = [];
  const polylines: KmlPolyline[] = [];

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  let hasValidCoords = false;

  const placemarks = xmlDoc.getElementsByTagName('Placemark');

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];

    // Nome
    const nameNode = placemark.getElementsByTagName('name')[0];
    const name = nameNode ? nameNode.textContent?.trim() || `Ponto ${i + 1}` : `Ponto ${i + 1}`;

    // Descrição
    const descNode = placemark.getElementsByTagName('description')[0];
    const description = descNode ? cleanDescription(descNode.textContent || '') : '';

    // Nome da Pasta Pai (se houver)
    let folderName = '';
    const parentFolder = placemark.parentElement;
    if (parentFolder && parentFolder.tagName.toLowerCase() === 'folder') {
      const folderNameNode = parentFolder.getElementsByTagName('name')[0];
      if (folderNameNode) folderName = folderNameNode.textContent?.trim() || '';
    }

    // 1. Verificar se é PONTO (<Point>)
    const pointNode = placemark.getElementsByTagName('Point')[0];
    if (pointNode) {
      const coordsNode = pointNode.getElementsByTagName('coordinates')[0];
      if (coordsNode && coordsNode.textContent) {
        const rawCoords = coordsNode.textContent.trim();
        // Coordenadas KML são no formato: longitude,latitude,altitude
        const parts = rawCoords.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          const altitude = parts[2] ? parseFloat(parts[2]) : undefined;

          if (!isNaN(lat) && !isNaN(lng)) {
            points.push({
              id: `kml-pt-${i}-${Date.now()}`,
              name,
              description,
              lat,
              lng,
              altitude,
              folder: folderName,
              rawCoordinates: rawCoords
            });

            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            hasValidCoords = true;
          }
        }
      }
    }

    // 2. Verificar se é LINHA / ROTA (<LineString>)
    const lineNode = placemark.getElementsByTagName('LineString')[0];
    if (lineNode) {
      const coordsNode = lineNode.getElementsByTagName('coordinates')[0];
      if (coordsNode && coordsNode.textContent) {
        const rawCoordsList = coordsNode.textContent.trim().split(/\s+/);
        const polylineCoords: [number, number][] = [];

        for (const coordStr of rawCoordsList) {
          const parts = coordStr.split(',').map(s => s.trim());
          if (parts.length >= 2) {
            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
              polylineCoords.push([lat, lng]);

              minLat = Math.min(minLat, lat);
              maxLat = Math.max(maxLat, lat);
              minLng = Math.min(minLng, lng);
              maxLng = Math.max(maxLng, lng);
              hasValidCoords = true;
            }
          }
        }

        if (polylineCoords.length > 0) {
          polylines.push({
            id: `kml-poly-${i}-${Date.now()}`,
            name,
            description,
            coordinates: polylineCoords
          });
        }
      }
    }
  }

  return {
    fileName,
    points,
    polylines,
    bounds: hasValidCoords ? { minLat, maxLat, minLng, maxLng } : undefined
  };
}

/**
 * Gera um arquivo KML de exemplo para testes
 */
export function generateSampleKml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Pontos de Telecom e Pop - Exemplo</name>
    <description>Amostra de localizações para teste de navegação KML</description>

    <Folder>
      <name>POP Principal - São Paulo</name>
      <Placemark>
        <name>POP Telecom Paulista</name>
        <description><![CDATA[<b>Tipo:</b> Central Datacenter<br><b>Capacidade:</b> 100 Gbps<br><b>Responsável:</b> Equipe NOC]]></description>
        <Point>
          <coordinates>-46.655881,-23.561414,760</coordinates>
        </Point>
      </Placemark>
      <Placemark>
        <name>Torre de Transmissão Faria Lima</name>
        <description><![CDATA[Torre rádio enlace 45m. Equipamentos Huawei e Cisco.]]></description>
        <Point>
          <coordinates>-46.686121,-23.582885,740</coordinates>
        </Point>
      </Placemark>
    </Folder>

    <Folder>
      <name>Subestações e CTOs</name>
      <Placemark>
        <name>CTO-012 Berrini</name>
        <description><![CDATA[Caixa de terminação óptica 16 portas. Atendendo clientes empresariais.]]></description>
        <Point>
          <coordinates>-46.695420,-23.601230,730</coordinates>
        </Point>
      </Placemark>
      <Placemark>
        <name>Caixa Subterrânea CS-04 Pinheiros</name>
        <description><![CDATA[Fusão de cabo tronco 144 FO. Acesso com chave especial NOC.]]></description>
        <Point>
          <coordinates>-46.699100,-23.567200,745</coordinates>
        </Point>
      </Placemark>
    </Folder>
  </Document>
</kml>`;
}
