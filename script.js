// =============================================================
// CORREO ARGENTINO — RED DE CENTROS LOGÍSTICOS (CLOG)
// script.js — Lógica de mapa interactivo, marcadores y fichas técnicas
// =============================================================

// =============================================================
// 1. DATASET DE CENTROS LOGÍSTICOS OFICIALES
// =============================================================
const todosLosNodos = (typeof NODOS_DATA_OFICIAL !== "undefined" && Array.isArray(NODOS_DATA_OFICIAL))
  ? NODOS_DATA_OFICIAL
  : [];

// Filtramos exclusivamente los Centros Logísticos (CLOG)
const nodosData = todosLosNodos.filter(n => n.tipo === "CLOG");

// =============================================================
// 2. ESTADO GLOBAL Y CONFIGURACIÓN MAPA LEAFLET
// =============================================================
let leafletMap = null;
let nodoActivo = null;
let geojsonLayer = null;
let mascaraExteriorLayer = null;
let markersLayerGroup = null;
let clustersLayerGroup = null;
let regionActiva = "nacional";

// Bounding box inicial para Argentina continental (encuadre ceñido y óptimo)
const BND_ARGENTINA = [
  [-55.2, -73.6],
  [-21.8, -53.6]
];

// Helper para buscar CLOGs por provincia
function buscarNodosPorProvincia(prov) {
  return nodosData.filter(n => n.provincia === prov);
}

// =============================================================
// 3. INICIALIZACIÓN
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
  inicializarMapaLeaflet();
  configurarBuscador();
  actualizarContadorCLOGs();
});

function actualizarContadorCLOGs() {
  const badge = document.getElementById("clog-counter-badge");
  if (badge) {
    const cant = (regionActiva === "nacional" || !regionActiva)
      ? nodosData.length
      : nodosData.filter(n => n.regionKey === regionActiva).length;
    badge.innerHTML = `<span class="clog-dot-live"></span><span class="clog-badge-text"><strong>${cant}</strong> CLOGs</span>`;
  }
}

// =============================================================
// 4. MAPA LEAFLET
// =============================================================
function inicializarMapaLeaflet() {
  const container = document.getElementById("mapa-leaflet");
  if (!container) return;

  leafletMap = L.map("mapa-leaflet", {
    zoomControl: false,
    attributionControl: true,
    minZoom: 4.2,
    maxZoom: 19,
    bounceAtZoomLimits: true,
    maxBounds: [
      [-56.8, -75.5],
      [-21.2, -52.0]
    ],
    maxBoundsViscosity: 0.95
  });

  // Encuadre inicial ceñido a Argentina
  leafletMap.fitBounds(BND_ARGENTINA, {
    padding: [16, 16]
  });

  setTimeout(() => {
    if (leafletMap) {
      const zNac = leafletMap.getZoom();
      leafletMap.setMinZoom(zNac);
      actualizarEstadoBotonesZoom();
    }
  }, 120);

  // Paneles de z-index dedicados
  leafletMap.createPane("mascaraPane");
  leafletMap.getPane("mascaraPane").style.zIndex = 350;
  leafletMap.getPane("mascaraPane").style.pointerEvents = "none";

  leafletMap.createPane("provinciasPane");
  leafletMap.getPane("provinciasPane").style.zIndex = 380;

  // Capa Base CartoDB Positron
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=cb1_47km_1_a9a7e15ee94d196eec40bf56", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
  }).addTo(leafletMap);

  // Capas de marcadores y clusters
  markersLayerGroup = L.layerGroup().addTo(leafletMap);
  clustersLayerGroup = L.layerGroup().addTo(leafletMap);

  // Cargar provincias y máscara
  cargarCapaProvincias();

  // Escuchar zoom
  leafletMap.on("zoomend", () => {
    actualizarMarcadoresLeaflet();
    actualizarEstadoBotonesZoom();
  });

  // Click en mapa deselecciona
  leafletMap.on("click", (e) => {
    if (!e.originalEvent || !e.originalEvent._markerClick) {
      deseleccionarTodo();
    }
  });

  // Render inicial de marcadores
  actualizarMarcadoresLeaflet();

  // ResizeObserver para mantener mapa fluido
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (leafletMap) leafletMap.invalidateSize();
    });
    ro.observe(container);
  }
}

// =============================================================
// 5. MÁSCARA Y PROVINCIAS
// =============================================================
function cargarCapaProvincias() {
  const geojson = (typeof GEOJSON_ARGENTINA !== "undefined" && GEOJSON_ARGENTINA) ? GEOJSON_ARGENTINA : null;

  if (geojson) {
    aplicarMascaraYProvincias(geojson);
  } else {
    fetch("provincias.geojson")
      .then(r => r.json())
      .then(data => aplicarMascaraYProvincias(data))
      .catch(err => console.warn("No se cargó provincias.geojson:", err));
  }
}

function aplicarMascaraYProvincias(geojson) {
  crearMascaraExterior(geojson);
  dibujarProvincias(geojson);
}

function crearMascaraExterior(geojson) {
  if (mascaraExteriorLayer && leafletMap) {
    leafletMap.removeLayer(mascaraExteriorLayer);
  }

  const worldOuter = [
    [-85.0511, -180],
    [85.0511, -180],
    [85.0511, 180],
    [-85.0511, 180],
    [-85.0511, -180]
  ];

  const huecos = [];
  geojson.features.forEach(f => {
    if (!f.geometry || !f.geometry.coordinates) return;
    if (f.geometry.type === "Polygon") {
      const ring = f.geometry.coordinates[0].map(pt => [pt[1], pt[0]]);
      huecos.push(ring);
    } else if (f.geometry.type === "MultiPolygon") {
      f.geometry.coordinates.forEach(poly => {
        const ring = poly[0].map(pt => [pt[1], pt[0]]);
        huecos.push(ring);
      });
    }
  });

  mascaraExteriorLayer = L.polygon([worldOuter, ...huecos], {
    pane: "mascaraPane",
    fillColor: "#d0dcea",
    fillOpacity: 1.0,
    stroke: true,
    color: "#8ca8cb",
    weight: 1.6,
    interactive: false
  }).addTo(leafletMap);
}

function dibujarProvincias(geojson) {
  if (geojsonLayer && leafletMap) {
    leafletMap.removeLayer(geojsonLayer);
  }

  geojsonLayer = L.geoJSON(geojson, {
    pane: "provinciasPane",
    style: {
      fillColor: "#002554",
      fillOpacity: 0.03,
      color: "#6b8eb6",
      weight: 1.2,
      opacity: 0.65
    },
    onEachFeature: (feature, layer) => {
      const nombre = feature.properties.name || feature.properties.nombre || "";
      layer.on({
        mouseover: (e) => {
          const l = e.target;
          l.setStyle({
            fillColor: "#002554",
            fillOpacity: 0.12,
            color: "#002554",
            weight: 1.8,
            opacity: 0.9
          });
        },
        mouseout: (e) => {
          if (geojsonLayer) geojsonLayer.resetStyle(e.target);
        },
        click: (e) => {
          if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.blur) {
            e.originalEvent.target.blur();
          }
          if (e.target && e.target._path && e.target._path.blur) {
            e.target._path.blur();
          }
          if (leafletMap) {
            leafletMap.fitBounds(e.target.getBounds(), { padding: [30, 30], maxZoom: 9 });
          }
        }
      });
      if (nombre) {
        layer.bindTooltip(nombre, {
          permanent: false,
          direction: "center",
          className: "provincia-tooltip"
        });
      }
    }
  }).addTo(leafletMap);
}

// =============================================================
// 6. RENDERIZADO DE MARCADORES Y CLUSTERS DE CENTROS LOGÍSTICOS
// =============================================================
function actualizarMarcadoresLeaflet() {
  if (!leafletMap || !markersLayerGroup || !clustersLayerGroup) return;

  markersLayerGroup.clearLayers();
  clustersLayerGroup.clearLayers();

  const zoomActual = leafletMap.getZoom();

  // Radio de agrupación en píxeles según zoom
  let radioPixels = 0;
  if (zoomActual < 5.8) {
    radioPixels = 48; // Agrupa nodos muy próximos a nivel nacional
  } else if (zoomActual < 7.2) {
    radioPixels = 32;
  } else if (zoomActual < 8.8) {
    radioPixels = 18;
  } else {
    radioPixels = 0; // Separados por completo
  }

  // Filtrado por región si aplica
  const listaNodos = (regionActiva === "nacional" || !regionActiva)
    ? nodosData
    : nodosData.filter(n => n.regionKey === regionActiva);

  const clusters = [];
  const asignados = new Set();

  listaNodos.forEach((nodo, i) => {
    if (asignados.has(nodo.id)) return;

    const clusterNodos = [nodo];
    asignados.add(nodo.id);

    if (radioPixels > 0) {
      const pt1 = leafletMap.latLngToContainerPoint([nodo.lat, nodo.lng]);

      listaNodos.forEach((otro, j) => {
        if (i === j || asignados.has(otro.id)) return;
        const pt2 = leafletMap.latLngToContainerPoint([otro.lat, otro.lng]);
        const dist = Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y);
        if (dist < radioPixels) {
          clusterNodos.push(otro);
          asignados.add(otro.id);
        }
      });
    }

    clusters.push(clusterNodos);
  });

  // Renderizar cada cluster o nodo
  clusters.forEach(clusterNodos => {
    if (clusterNodos.length > 1) {
      const avgLat = clusterNodos.reduce((s, n) => s + n.lat, 0) / clusterNodos.length;
      const avgLng = clusterNodos.reduce((s, n) => s + n.lng, 0) / clusterNodos.length;

      const nombresList = clusterNodos.map(n => `[${n.cod}] ${n.nombre}`).join(" · ");
      const clusterIcon = L.divIcon({
        className: "leaflet-cluster-icon",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `
          <div class="clog-cluster-wrap" title="${clusterNodos.length} Centros Logísticos: ${nombresList}">
            ${clusterNodos.length}
          </div>
        `
      });

      const clusterMarker = L.marker([avgLat, avgLng], { icon: clusterIcon, zIndexOffset: 250 });
      clusterMarker.on("click", (e) => {
        if (e.originalEvent) e.originalEvent._markerClick = true;
        const bounds = L.latLngBounds(clusterNodos.map(n => [n.lat, n.lng]));
        leafletMap.flyToBounds(bounds, {
          padding: [50, 50],
          maxZoom: Math.max(leafletMap.getZoom() + 2, 8.5),
          duration: 0.8
        });
      });
      clustersLayerGroup.addLayer(clusterMarker);

    } else {
      const nodo = clusterNodos[0];
      const estaSel = nodoActivo && nodoActivo.id === nodo.id;

      const markerIcon = L.divIcon({
        className: "leaflet-clog-icon",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        html: `
          <div class="clog-marker-wrap tipo-clog ${estaSel ? "seleccionado" : ""}" id="marker-${nodo.id}" data-id="${nodo.id}">
            <div class="clog-marker-dot"></div>
            <div class="clog-marker-pill">
              <span class="pill-name">${nodo.nombre}</span>
              <span class="pill-cod">${nodo.cod}</span>
            </div>
          </div>
        `
      });

      const m = L.marker([nodo.lat, nodo.lng], { icon: markerIcon, zIndexOffset: estaSel ? 500 : 100 });
      m.on("click", (e) => {
        if (e.originalEvent) e.originalEvent._markerClick = true;
        seleccionarEsteNodo(nodo);
      });

      markersLayerGroup.addLayer(m);
    }
  });
}

function seleccionarEsteNodo(nodo) {
  nodoActivo = nodo;

  document.querySelectorAll(".clog-marker-wrap").forEach(el => {
    if (el.getAttribute("data-id") === nodo.id) {
      el.classList.add("seleccionado");
    } else {
      el.classList.remove("seleccionado");
    }
  });

  if (leafletMap && leafletMap.getZoom() < 8) {
    leafletMap.flyTo([nodo.lat, nodo.lng], 10, { duration: 0.65 });
  }

  abrirDetalleNodo(nodo);
}

function deseleccionarTodo() {
  nodoActivo = null;
  cerrarPopupNodo();
  document.querySelectorAll(".clog-marker-wrap.seleccionado").forEach(el => el.classList.remove("seleccionado"));
}

// =============================================================
// 7. CONTROLES DE ZOOM Y NAVEGACIÓN
// =============================================================
function zoomIn() {
  if (leafletMap) leafletMap.zoomIn();
}

function zoomOut() {
  if (leafletMap && leafletMap.getZoom() > leafletMap.getMinZoom()) {
    leafletMap.zoomOut();
  }
}

function zoomReset() {
  if (leafletMap) {
    leafletMap.flyToBounds(BND_ARGENTINA, {
      padding: [16, 16],
      duration: 0.8
    });
  }
}

function actualizarEstadoBotonesZoom() {
  const btnOut = document.getElementById("btn-zoom-out");
  if (!btnOut || !leafletMap) return;
  const atMin = leafletMap.getZoom() <= (leafletMap.getMinZoom() || 4.2);
  if (atMin) {
    btnOut.style.opacity = "0.38";
    btnOut.style.cursor = "not-allowed";
    btnOut.setAttribute("disabled", "true");
  } else {
    btnOut.style.opacity = "1";
    btnOut.style.cursor = "pointer";
    btnOut.removeAttribute("disabled");
  }
}

// =============================================================
// 8. FILTRO POR REGIÓN RÁPIDO (HEADER CHIPS)
// =============================================================
function seleccionarRegionNav(region, btn) {
  regionActiva = region;

  document.querySelectorAll(".region-chip").forEach(c => c.classList.remove("activo"));
  if (btn) btn.classList.add("activo");

  actualizarContadorCLOGs();
  actualizarMarcadoresLeaflet();

  if (region === "nacional" || !region) {
    zoomReset();
  } else {
    const nodosRegion = nodosData.filter(n => n.regionKey === region);
    if (nodosRegion.length > 0 && leafletMap) {
      const bounds = L.latLngBounds(nodosRegion.map(n => [n.lat, n.lng]));
      leafletMap.flyToBounds(bounds, {
        padding: [45, 45],
        maxZoom: region === "amba" ? 11 : (region === "pba" ? 8 : 7.5),
        duration: 0.85
      });
    }
  }
}

// =============================================================
// 9. FICHA TÉCNICA DETALLADA (POPUP DE NODO)
// =============================================================
function parseNumero(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  const clean = v.toString().replace(/\./g, "").replace(",", ".").trim();
  if (clean.includes(" a ")) {
    const parts = clean.split(" a ");
    return (parseFloat(parts[0]) + parseFloat(parts[1])) / 2 || 0;
  }
  return parseFloat(clean) || 0;
}

function obtenerFotosNodo(nodo) {
  if (!nodo) return ["imagenes/placeholder.jpg"];
  if (Array.isArray(nodo.fotos)) {
    return nodo.fotos.length > 0 ? nodo.fotos : ["imagenes/placeholder.jpg"];
  }
  if (typeof nodo.fotos === "string" && nodo.fotos.trim().length > 0) {
    return [nodo.fotos.trim()];
  }
  return ["imagenes/placeholder.jpg"];
}

function abrirDetalleNodo(nodo, nodosHermano = null) {
  nodoActivo = nodo;

  const popup = document.getElementById("popup-nodo");
  if (!popup) return;

  // Header info
  const elNombre = document.getElementById("popup-nombre");
  if (elNombre) elNombre.textContent = nodo.nombreCompleto || nodo.nombre;

  const elCodPill = document.getElementById("popup-cod-pill");
  if (elCodPill) elCodPill.textContent = nodo.cod || "";

  const elBadgeCod = document.getElementById("popup-badge-cod");
  if (elBadgeCod) elBadgeCod.textContent = nodo.cod || "";

  const elUbicacion = document.getElementById("popup-ubicacion");
  if (elUbicacion) elUbicacion.textContent = `${nodo.provincia} · ${nodo.region}`;

  const elDomicilio = document.getElementById("popup-domicilio");
  if (elDomicilio) elDomicilio.textContent = nodo.domicilio || "Dirección operativa oficial";

  const elBadgeTipo = document.getElementById("popup-badge-tipo");
  if (elBadgeTipo) elBadgeTipo.textContent = "Centro Logístico (CLOG)";

  // Fotos
  const imgEl = document.getElementById("popup-img");
  const fotos = obtenerFotosNodo(nodo);
  fotoActualIdx = 0;
  if (imgEl) imgEl.src = fotos[0];

  const strip = document.getElementById("popup-galeria-strip");
  const arrowPrev = document.getElementById("popup-arrow-prev");
  const arrowNext = document.getElementById("popup-arrow-next");
  const counter = document.getElementById("popup-foto-counter");

  if (strip) {
    strip.innerHTML = "";
    if (fotos.length > 1) {
      fotos.forEach((f, idx) => {
        const thumb = document.createElement("img");
        thumb.src = f;
        thumb.className = `popup-thumb ${idx === 0 ? "activa" : ""}`;
        thumb.alt = `Foto ${idx + 1} de ${nodo.nombre}`;
        thumb.onclick = (e) => {
          e.stopPropagation();
          fotoActualIdx = idx;
          actualizarFotoPopup(fotos);
        };
        strip.appendChild(thumb);
      });
      strip.style.display = "flex";
    } else {
      strip.style.display = "none";
    }
  }

  if (arrowPrev) arrowPrev.style.display = fotos.length > 1 ? "flex" : "none";
  if (arrowNext) arrowNext.style.display = fotos.length > 1 ? "flex" : "none";
  if (counter) counter.textContent = fotos.length > 1 ? `1 / ${fotos.length}` : "";

  // Selector si la provincia tiene múltiples CLOGs
  const pillsCont = document.getElementById("popup-nodos-pills");
  if (pillsCont) {
    pillsCont.innerHTML = "";
    const hermanos = nodosHermano || buscarNodosPorProvincia(nodo.provincia);
    if (hermanos && hermanos.length > 1) {
      hermanos.forEach(h => {
        const btn = document.createElement("button");
        btn.className = `popup-nodo-pill-btn ${h.id === nodo.id ? "activa" : ""}`;
        btn.textContent = `${h.cod ? `[${h.cod}] ` : ""}${h.nombre}`;
        btn.onclick = (e) => {
          e.stopPropagation();
          abrirDetalleNodo(h, hermanos);
        };
        pillsCont.appendChild(btn);
      });
      pillsCont.style.display = "flex";
    } else {
      pillsCont.style.display = "none";
    }
  }

  // 3 Stats Principales
  const elCap = document.getElementById("popup-capacidad");
  if (elCap) elCap.textContent = nodo.capacidad || "S/D";

  const elPiezas = document.getElementById("popup-piezas");
  if (elPiezas) elPiezas.textContent = nodo.piezasDia || "S/D";

  const elPiezasLbl = document.getElementById("popup-piezas-lbl");
  if (elPiezasLbl) elPiezasLbl.textContent = "Promedio diario paquetería";

  const elPiezasSub = document.getElementById("popup-piezas-sub");
  if (elPiezasSub) {
    const numVta = parseNumero(nodo.volumenVenta);
    const numJur = parseNumero(nodo.volumenJurisdiccion);
    if (numVta > 0 || numJur > 0) {
      elPiezasSub.textContent = `${numVta.toLocaleString("es-AR")} Imp. · ${numJur.toLocaleString("es-AR")} Jur.`;
      elPiezasSub.style.display = "block";
    } else if (nodo.ingresoEnvios && nodo.ingresoEnvios.diarioMaquinable) {
      const maq = Math.round(nodo.ingresoEnvios.diarioMaquinable);
      const noMaq = Math.round(nodo.ingresoEnvios.diarioNoMaquinable || 0);
      elPiezasSub.textContent = `${maq.toLocaleString('es-AR')} Maq. · ${noMaq.toLocaleString('es-AR')} No Maq.`;
      elPiezasSub.style.display = "block";
    } else {
      elPiezasSub.textContent = "Envíos / día";
      elPiezasSub.style.display = "block";
    }
  }

  const elDot = document.getElementById("popup-dotacion");
  if (elDot) elDot.textContent = nodo.dotacionTotal ? `${nodo.dotacionTotal} pers.` : "S/D";

  const elDotLbl = document.getElementById("popup-dotacion-lbl");
  if (elDotLbl) {
    elDotLbl.textContent = nodo.dotacionAuxiliares ? `${nodo.dotacionAuxiliares} auxiliares operativos` : "Dotación total";
  }

  // Piezas Postales 2D
  const secPostal2D = document.getElementById("popup-postal2d-section");
  const elPostal2DVal = document.getElementById("pop-postal2d-val");
  const elPostal2DSub = document.getElementById("pop-postal2d-sub");
  if (secPostal2D) {
    if (nodo.volumen2DNum !== undefined && nodo.volumen2DNum !== null && nodo.volumen2DNum > 0) {
      if (elPostal2DVal) elPostal2DVal.textContent = Math.round(nodo.volumen2DNum).toLocaleString("es-AR");
      if (elPostal2DSub) {
        if (nodo.volumen2dMensualNum) {
          elPostal2DSub.textContent = `Volumen Mensual: ${Math.round(nodo.volumen2dMensualNum).toLocaleString("es-AR")} piezas 2D`;
        } else {
          elPostal2DSub.textContent = "Volumen diario auditado";
        }
      }
      secPostal2D.style.display = "block";
    } else {
      secPostal2D.style.display = "none";
    }
  }

  // Calidad SLA & FV
  const secCalidad = document.getElementById("popup-calidad-section");
  const elSlaVal = document.getElementById("popup-sla-val");
  const elFvVal = document.getElementById("popup-fv-val");
  if (secCalidad) {
    if (nodo.calidad && nodo.calidad.slaPaqAr !== undefined && nodo.calidad.fvPaqAr !== undefined && !nodo.isSpecialEstanco) {
      if (elSlaVal) elSlaVal.textContent = `${nodo.calidad.slaPaqAr.toString().replace(".", ",")}%`;
      if (elFvVal) elFvVal.textContent = `${nodo.calidad.fvPaqAr.toString().replace(".", ",")}%`;
      secCalidad.style.display = "block";
    } else {
      secCalidad.style.display = "none";
    }
  }

  // Turnos Operativos
  const secTurnos = document.getElementById("popup-turnos-section");
  const tNoche = nodo.turnos?.noche;
  const tManana = nodo.turnos?.manana;
  const tTarde = nodo.turnos?.tarde;

  if (secTurnos) {
    if (nodo.turnos && (tNoche || tManana || tTarde) && !nodo.isSpecialEstanco) {
      secTurnos.style.display = "block";
    } else {
      secTurnos.style.display = "none";
    }
  }

  function formatDotacionTurno(t) {
    if (!t) return "0 personas";
    const jer = parseInt(t.jerarquico, 10) || 0;
    const aux = parseInt(t.auxiliares, 10) || 0;
    const tot = jer + aux;
    if (tot === 0) return "0 personas";
    if (jer > 0) return `${tot} personas (${aux} aux · ${jer} jer)`;
    return `${tot} personas (${aux} aux)`;
  }

  const elNocheF = document.getElementById("turno-noche-franja");
  const elNocheD = document.getElementById("turno-noche-dot");
  if (elNocheF) elNocheF.textContent = (tNoche?.franja && tNoche.franja.toLowerCase() !== "no hay" && tNoche.franja.toLowerCase() !== "no" && tNoche.franja.toLowerCase() !== "no tiene") ? tNoche.franja : "Sin turno noche";
  if (elNocheD) elNocheD.textContent = formatDotacionTurno(tNoche);

  const elMananaF = document.getElementById("turno-manana-franja");
  const elMananaD = document.getElementById("turno-manana-dot");
  if (elMananaF) elMananaF.textContent = (tManana?.franja && tManana.franja.toLowerCase() !== "no hay" && tManana.franja.toLowerCase() !== "no") ? tManana.franja : "Sin turno mañana";
  if (elMananaD) elMananaD.textContent = formatDotacionTurno(tManana);

  const elTardeF = document.getElementById("turno-tarde-franja");
  const elTardeD = document.getElementById("turno-tarde-dot");
  if (elTardeF) elTardeF.textContent = (tTarde?.franja && tTarde.franja.toLowerCase() !== "no hay" && tTarde.franja.toLowerCase() !== "no" && tTarde.franja !== "0") ? tTarde.franja : "Sin turno tarde";
  if (elTardeD) elTardeD.textContent = formatDotacionTurno(tTarde);

  // Procesos
  const procGrid = document.querySelector(".popup-procesos-grid");
  if (procGrid) {
    procGrid.style.display = (nodo.isSpecialEstanco || !nodo.procesos) ? "none" : "flex";
  }

  function updateProcBadge(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const activo = val && val !== "0" && val !== "no" && val.toLowerCase() !== "no hay";
    el.classList.toggle("inactivo", !activo);
    if (activo && val !== "si" && val !== "1") {
      el.title = `Dotación / puestos asignados: ${val}`;
    }
  }
  updateProcBadge("proc-cdp", nodo.procesos?.cdp);
  updateProcBadge("proc-ctp", nodo.procesos?.ctp);
  updateProcBadge("proc-ptapta", nodo.procesos?.ptaPta);
  updateProcBadge("proc-clasif", nodo.procesos?.clasificacion);

  // Responsables e Inmueble
  const elJefePlanta = document.getElementById("popup-jefe-planta");
  if (elJefePlanta) elJefePlanta.textContent = nodo.responsables?.jefePlanta || "No especificado";

  const elJefeNodo = document.getElementById("popup-jefe-nodo");
  const respNodoWrap = elJefeNodo?.closest(".resp-item");
  if (respNodoWrap) {
    respNodoWrap.style.display = (nodo.isSpecialEstanco || !nodo.responsables?.jefeNodo || nodo.responsables.jefeNodo === nodo.responsables?.jefePlanta) ? "none" : "flex";
  }
  if (elJefeNodo) elJefeNodo.textContent = nodo.responsables?.jefeNodo || "No especificado";

  const elInmueble = document.getElementById("popup-inmueble");
  if (elInmueble) {
    elInmueble.textContent = nodo.inmueble?.alquilada ? (nodo.inmueble.alquilada === "Propio" ? "Inmueble Propio" : `Alquilada (${nodo.inmueble.alquilada})`) : "Inmueble Operativo";
  }

  const elAlmacen = document.getElementById("popup-almacenamiento");
  if (elAlmacen) {
    const detalles = [
      nodo.inmueble?.almacenamiento,
      nodo.inmueble?.racks,
      nodo.inmueble?.seguridadObservaciones || nodo.inmueble?.seguridad
    ].filter(Boolean);
    elAlmacen.textContent = detalles.length > 0 ? detalles.join(" · ") : "Estándar operativo";
  }

  // Ingreso de envíos
  const secIngresos = document.getElementById("popup-ingresos-section");
  if (secIngresos) {
    const ing = nodo.ingresoEnvios;
    if (ing && (ing.impoMensual > 0 || ing.ingresoMensualUltimaMilla > 0)) {
      const elMaq = document.getElementById("pop-ing-maq");
      const elMaqSub = document.getElementById("pop-ing-maq-sub");
      const elNoMaq = document.getElementById("pop-ing-nomaq");
      const elNoMaqSub = document.getElementById("pop-ing-nomaq-sub");
      const elUm = document.getElementById("pop-ing-um");
      const elUmSub = document.getElementById("pop-ing-um-sub");

      const elMaqLbl = document.getElementById("pop-ing-maq-lbl");
      const elNoMaqLbl = document.getElementById("pop-ing-nomaq-lbl");
      const elUmLbl = document.getElementById("pop-ing-um-lbl");

      if (nodo.id === "trt") {
        if (elMaqLbl) elMaqLbl.textContent = "Impo Volumen";
        if (elMaq) elMaq.textContent = `${Math.round(ing.impoMensual / 22 || 3851).toLocaleString("es-AR")} / día`;
        if (elMaqSub) elMaqSub.textContent = `${Math.round(ing.impoMensual).toLocaleString("es-AR")} mensual`;

        if (elNoMaqLbl) elNoMaqLbl.textContent = "No Maquinable";
        if (elNoMaq) elNoMaq.textContent = `${Math.round(ing.diarioNoMaquinable || 2774).toLocaleString("es-AR")} / día`;
        if (elNoMaqSub) elNoMaqSub.textContent = `${Math.round(ing.impoMensualNoMaquinable || 61033).toLocaleString("es-AR")} mensual`;

        if (elUmLbl) elUmLbl.textContent = "Imposición Directa";
        if (elUm) elUm.textContent = `${Math.round(ing.diarioUltimaMilla || 2754).toLocaleString("es-AR")} / día`;
        if (elUmSub) elUmSub.textContent = `${Math.round(ing.ingresoMensualUltimaMilla || 60593).toLocaleString("es-AR")} mensual`;
      } else if (nodo.id === "bue") {
        if (elMaqLbl) elMaqLbl.textContent = "Proceso Maquinable";
        if (elMaq) elMaq.textContent = `${Math.round(ing.diarioMaquinable).toLocaleString("es-AR")} / día`;
        if (elMaqSub) elMaqSub.textContent = `${Math.round(ing.impoMensualMaquinable).toLocaleString("es-AR")} mensual`;

        if (elNoMaqLbl) elNoMaqLbl.textContent = "Proceso No Maquinable";
        if (elNoMaq) elNoMaq.textContent = `${Math.round(ing.diarioNoMaquinable).toLocaleString("es-AR")} / día`;
        if (elNoMaqSub) elNoMaqSub.textContent = `${Math.round(ing.impoMensualNoMaquinable).toLocaleString("es-AR")} mensual`;

        if (elUmLbl) elUmLbl.textContent = "Imposición";
        if (elUm) elUm.textContent = `${Math.round(ing.diarioUltimaMilla).toLocaleString("es-AR")} / día`;
        if (elUmSub) elUmSub.textContent = `${Math.round(ing.ingresoMensualUltimaMilla).toLocaleString("es-AR")} mensual`;
      } else {
        if (elMaqLbl) elMaqLbl.textContent = "Maquinable";
        if (elNoMaqLbl) elNoMaqLbl.textContent = "No Maquinable";
        if (elUmLbl) elUmLbl.textContent = "Promedio diario última milla";

        const valMaq = Math.round(ing.diarioMaquinable || 0);
        if (elMaq) elMaq.textContent = `${valMaq.toLocaleString("es-AR")} / día`;
        if (elMaqSub) elMaqSub.textContent = ing.impoMensualMaquinable ? `${Math.round(ing.impoMensualMaquinable).toLocaleString("es-AR")} mensual` : "";

        const valNoMaq = Math.round(ing.diarioNoMaquinable || 0);
        if (elNoMaq) elNoMaq.textContent = `${valNoMaq.toLocaleString("es-AR")} / día`;
        if (elNoMaqSub) elNoMaqSub.textContent = ing.impoMensualNoMaquinable ? `${Math.round(ing.impoMensualNoMaquinable).toLocaleString("es-AR")} mensual` : "";

        const valUm = Math.round(ing.diarioUltimaMilla || 0);
        if (elUm) elUm.textContent = `${valUm.toLocaleString("es-AR")} / día`;
        if (elUmSub) elUmSub.textContent = ing.ingresoMensualUltimaMilla ? `${Math.round(ing.ingresoMensualUltimaMilla).toLocaleString("es-AR")} mensual` : "";
      }
      secIngresos.style.display = "block";
    } else {
      secIngresos.style.display = "none";
    }
  }

  // Líneas de Transporte
  function formatHorarioTransporte(str) {
    if (!str || str.toLowerCase() === "no especifica") return "";
    let clean = str.trim();
    if (/^\d{1,2}:\d{2}$/.test(clean)) return `${clean} hs`;
    return clean;
  }

  const secTrans = document.getElementById("popup-transportes-section");
  if (secTrans) {
    const rutas = nodo.transportes || [];
    if (rutas.length > 0) {
      const elCant = document.getElementById("pop-trans-cant");
      const elList = document.getElementById("popup-transportes-list");
      if (elCant) elCant.textContent = rutas.length;
      if (elList) {
        elList.innerHTML = rutas.slice(0, 15).map(r => {
          const horLleg = formatHorarioTransporte(r.horarioLlegada);
          const horSal = formatHorarioTransporte(r.horarioSalida);
          let horarioTexto = "";
          if (horLleg && horSal && horLleg !== horSal) {
            horarioTexto = `${horLleg} a ${horSal}`;
          } else if (horLleg) {
            horarioTexto = horLleg;
          } else if (horSal) {
            horarioTexto = horSal;
          }

          return `
          <div class="popup-tr-chip">
            <div>
              <strong>${r.linea}</strong>
              <span style="font-size:11px;color:#64748b;margin-left:6px;">${r.frecuencia || "LUN A VIE"}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              ${horarioTexto ? `<span style="font-size:11px;color:#002554;font-weight:700;">${horarioTexto}</span>` : ""}
              <span class="tr-badge">${r.tipoServicio || "TR"}</span>
            </div>
          </div>
        `;
        }).join("");
        if (rutas.length > 15) {
          elList.innerHTML += `<div style="font-size:11.5px;color:#64748b;text-align:center;padding-top:4px;">+ ${rutas.length - 15} líneas adicionales</div>`;
        }
      }
      secTrans.style.display = "block";
    } else {
      secTrans.style.display = "none";
    }
  }

  // Descripción
  const elDesc = document.getElementById("popup-desc");
  if (elDesc) elDesc.textContent = nodo.desc || `Centro Logístico oficial de Correo Argentino en la provincia de ${nodo.provincia}.`;

  const elCantFotos = document.getElementById("popup-cant-fotos");
  if (elCantFotos) elCantFotos.textContent = fotos.length;

  popup.classList.add("visible");
}

function cerrarPopupNodo() {
  const p = document.getElementById("popup-nodo");
  if (p) p.classList.remove("visible");
}

function cerrarPopupNodoOverlay(e) {
  if (e.target.id === "popup-nodo") {
    deseleccionarTodo();
  }
}

function actualizarFotoPopup(fotos) {
  const imgEl = document.getElementById("popup-img");
  const strip = document.getElementById("popup-galeria-strip");
  const counter = document.getElementById("popup-foto-counter");

  if (imgEl) {
    imgEl.style.opacity = "0";
    imgEl.style.transition = "opacity 0.18s ease";
    setTimeout(() => {
      imgEl.src = fotos[fotoActualIdx];
      imgEl.style.opacity = "1";
    }, 100);
  }

  if (strip) {
    strip.querySelectorAll(".popup-thumb").forEach((t, i) => {
      t.classList.toggle("activa", i === fotoActualIdx);
      if (i === fotoActualIdx) t.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }

  if (counter) counter.textContent = `${fotoActualIdx + 1} / ${fotos.length}`;
}

function popupFotoAnterior(e) {
  if (e) e.stopPropagation();
  if (!nodoActivo) return;
  const fotos = obtenerFotosNodo(nodoActivo);
  fotoActualIdx = (fotoActualIdx - 1 + fotos.length) % fotos.length;
  actualizarFotoPopup(fotos);
}

function popupFotoSiguiente(e) {
  if (e) e.stopPropagation();
  if (!nodoActivo) return;
  const fotos = obtenerFotosNodo(nodoActivo);
  fotoActualIdx = (fotoActualIdx + 1) % fotos.length;
  actualizarFotoPopup(fotos);
}

// =============================================================
// 10. MODAL DE GALERÍA EN PANTALLA COMPLETA
// =============================================================
let fotoActualIdx = 0;

function abrirGaleriaDesdePopup() {
  if (!nodoActivo) return;
  fotoActualIdx = 0;
  actualizarVistaGaleria();
  document.getElementById("modal-galeria").classList.add("visible");
}

function cerrarGaleria() {
  document.getElementById("modal-galeria").classList.remove("visible");
}

function cerrarGaleriaOverlay(e) {
  if (e.target.id === "modal-galeria") {
    cerrarGaleria();
  }
}

function fotoAnterior() {
  if (!nodoActivo) return;
  const fotos = obtenerFotosNodo(nodoActivo);
  fotoActualIdx = (fotoActualIdx - 1 + fotos.length) % fotos.length;
  actualizarVistaGaleria();
}

function fotoSiguiente() {
  if (!nodoActivo) return;
  const fotos = obtenerFotosNodo(nodoActivo);
  fotoActualIdx = (fotoActualIdx + 1) % fotos.length;
  actualizarVistaGaleria();
}

function actualizarVistaGaleria() {
  const fotos = obtenerFotosNodo(nodoActivo);
  document.getElementById("gal-img").src = fotos[fotoActualIdx];
  document.getElementById("gal-titulo").textContent = nodoActivo ? (nodoActivo.nombreCompleto || nodoActivo.nombre) : "Centro Logístico";
  document.getElementById("gal-sub").textContent = nodoActivo ? `${nodoActivo.provincia} · Centro Logístico (CLOG)` : "";
  document.getElementById("gal-contador").textContent = `Foto ${fotoActualIdx + 1} de ${fotos.length}`;
}

// Teclado para galería y popup
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    cerrarGaleria();
    cerrarPopupNodo();
  }
  const modalGal = document.getElementById("modal-galeria");
  if (modalGal && modalGal.classList.contains("visible")) {
    if (e.key === "ArrowLeft") fotoAnterior();
    if (e.key === "ArrowRight") fotoSiguiente();
  }
});

// =============================================================
// 11. BUSCADOR GLOBAL DE CENTROS LOGÍSTICOS
// =============================================================
function configurarBuscador() {
  const input = document.getElementById("global-search");
  const dropdown = document.getElementById("search-results-dropdown");
  const clearBtn = document.getElementById("search-clear-btn");
  if (!input) return;

  function filtrarResultados(q) {
    if (!q) {
      if (dropdown) dropdown.classList.remove("visible");
      if (clearBtn) clearBtn.style.display = "none";
      return;
    }
    if (clearBtn) clearBtn.style.display = "flex";

    const matches = nodosData.filter(n => {
      const txt = `${n.cod} ${n.nombre} ${n.nombreCompleto} ${n.provincia} ${n.ubicacion} ${n.domicilio}`.toLowerCase();
      return txt.includes(q);
    });

    if (dropdown) {
      if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding:12px 14px; font-size:12.5px; color:#8fa4bd; text-align:center;">No se encontraron centros logísticos para "${q}"</div>`;
      } else {
        dropdown.innerHTML = matches.slice(0, 8).map(m => `
          <div class="search-result-item" onclick="seleccionarPlantaDesdeBuscador('${m.id}')">
            <div class="sres-left">
              <span class="sres-name">${m.nombreCompleto || m.nombre}</span>
              <span class="sres-sub">${m.provincia} · ${m.ubicacion || ''}</span>
            </div>
            <span class="sres-cod">${m.cod}</span>
          </div>
        `).join("");
      }
      dropdown.classList.add("visible");
    }
  }

  input.addEventListener("input", e => {
    filtrarResultados(e.target.value.toLowerCase().trim());
  });

  input.addEventListener("focus", e => {
    if (e.target.value.trim()) {
      filtrarResultados(e.target.value.toLowerCase().trim());
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".header-search-wrap") && dropdown) {
      dropdown.classList.remove("visible");
    }
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      limpiarBuscador();
    } else if (e.key === "Enter") {
      const q = input.value.toLowerCase().trim();
      const match = nodosData.find(n => `${n.cod} ${n.nombre} ${n.nombreCompleto} ${n.provincia}`.toLowerCase().includes(q));
      if (match) {
        seleccionarPlantaDesdeBuscador(match.id);
      }
    }
  });
}

function limpiarBuscador() {
  const input = document.getElementById("global-search");
  const dropdown = document.getElementById("search-results-dropdown");
  const clearBtn = document.getElementById("search-clear-btn");
  if (input) input.value = "";
  if (dropdown) dropdown.classList.remove("visible");
  if (clearBtn) clearBtn.style.display = "none";
}

function seleccionarPlantaDesdeBuscador(id) {
  const nodo = nodosData.find(n => n.id === id);
  if (!nodo) return;
  limpiarBuscador();
  seleccionarEsteNodo(nodo);
}

// =============================================================
// 12. EXPORTAR CSV
// =============================================================
function descargarCSVOficial() {
  if (!nodosData.length) return;
  let csv = "Codigo,Centro_Logistico,Provincia,Region,Superficie_m2,Dotacion_Total,Auxiliares,Paquetes_Diarios,Jefe_Planta,Jefe_Nodo,Domicilio\n";
  nodosData.forEach(p => {
    const row = [
      `"${p.cod}"`,
      `"${p.nombreCompleto || p.nombre}"`,
      `"${p.provincia}"`,
      `"${p.region}"`,
      p.capacidadM2 || 0,
      p.dotacionTotal || 0,
      p.dotacionAuxiliares || 0,
      p.volumenTotalNum || 0,
      `"${p.responsables?.jefePlanta || ''}"`,
      `"${p.responsables?.jefeNodo || ''}"`,
      `"${p.domicilio || ''}"`
    ];
    csv += row.join(",") + "\n";
  });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "correo_argentino_centros_logisticos.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
