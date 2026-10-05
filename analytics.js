// =============================================================
// CORREO ARGENTINO — ANALYTICS & ESTADÍSTICAS LOGÍSTICAS
// Controlador de gráficos con Chart.js y datos oficiales del Excel
// =============================================================

document.addEventListener("DOMContentLoaded", () => {
  // Verificación de datos oficiales
  if (typeof NODOS_DATA_OFICIAL === "undefined" || !NODOS_DATA_OFICIAL.length) {
    console.error("No se encontró el dataset oficial NODOS_DATA_OFICIAL");
    return;
  }

  // Dataset oficial de 36 nodos auditados (BUE y TRT se mantienen como compartimento estanco exclusivo en sus tarjetas del mapa)
  const NODOS_ANALYTICS = NODOS_DATA_OFICIAL.filter(n => !n.isSpecialEstanco);

  // Paleta de colores oficial Correo Argentino
  const COLOR_AZUL_DARK   = "#002554";
  const COLOR_AZUL_MID    = "#004b99";
  const COLOR_AZUL_LIGHT  = "#2a75d3";
  const COLOR_AMARILLO    = "#FFD200";
  const COLOR_AMARILLO_DK = "#e6be00";
  const COLOR_CYAN        = "#0096c7";
  const COLOR_PURPLE      = "#6366f1";
  const COLOR_ORANGE      = "#f97316";
  const COLOR_GREEN       = "#10b981";
  const COLOR_RED         = "#ef4444";

  // Instancias de Chart.js
  let chartTopVolumen = null;
  let chartCuotaRegion = null;
  let chartTurnos = null;
  let chartIngresosMaq = null;
  let chartVolumenBarrasRegional = null;

  // Estado actual
  let currentRegion = "nacional";
  let currentSearch = "";
  let sortColumn = "volumenTotalNum";
  let sortDirection = "desc";

  // Estado SLA Paq.AR
  let currentSlaSearch = "";
  let sortSlaCol = "sla";
  let sortSlaDir = "desc";

  // Estado FV (1ª Visita)
  let currentFvSearch = "";
  let sortFvCol = "fv";
  let sortFvDir = "desc";

  // Estado del transporte
  let currentTransportService = "TODOS";
  let currentTransportSearch = "";

  // Mapeo de Regiones
  const REGIONES_INFO = {
    "nacional":  { nombre: "Nacional (36 plantas)", key: "nacional" },
    "amba":      { nombre: "Metropolitana / AMBA", key: "amba" },
    "pba":       { nombre: "PBA / La Pampa", key: "pba" },
    "centro":    { nombre: "Centro / NEA", key: "centro" },
    "cuyo":      { nombre: "Cuyo / NOA", key: "cuyo" },
    "patagonia": { nombre: "Patagonia / Sur", key: "patagonia" }
  };

  // Función de filtrado por región
  function getFilteredData(regionKey) {
    if (!regionKey || regionKey === "nacional") {
      return [...NODOS_ANALYTICS];
    }
    return NODOS_ANALYTICS.filter(n => n.regionKey === regionKey);
  }

  // =============================================================
  // Generador de curva SVG suave para el sparkline dinámico de volumen
  function calcularRutaSparkline(valores, w = 140, h = 28) {
    if (!valores || valores.length === 0) {
      return `M 0,${h - 4} L ${w},${h - 4}`;
    }

    const minVal = Math.min(...valores);
    const maxVal = Math.max(...valores);
    const rango = (maxVal - minVal) || 1;

    // Rango visual Y (7px arriba para que no toque el texto, 24px abajo)
    const yMin = 7;
    const yMax = h - 4;

    const puntos = valores.map((v, idx) => {
      const x = (idx / (valores.length - 1 || 1)) * w;
      const norm = (v - minVal) / rango;
      const y = yMax - (norm * (yMax - yMin));
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    if (puntos.length === 1) {
      return `M 0,${puntos[0].y} L ${w},${puntos[0].y}`;
    }

    let d = `M ${puntos[0].x},${puntos[0].y}`;
    for (let i = 0; i < puntos.length - 1; i++) {
      const p0 = puntos[i];
      const p1 = puntos[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
    }

    return d;
  }

  // =============================================================
  // 1. ACTUALIZAR TARJETAS KPI
  // =============================================================
  function actualizarKPIs(regionKey) {
    const data = getFilteredData(regionKey);

    const totalPlantas = data.length;

    // Cálculo según Columnas H, I, J (Imposición maquinable + no maquinable + última milla / jurisdicción)
    let totalImposicion = 0;
    let totalJurisdiccion = 0;
    let totalVolumen = 0;

    data.forEach(n => {
      let imp = 0;
      let jur = 0;
      const ing = n.ingresoEnvios;
      if (ing && (ing.diarioMaquinable || ing.diarioNoMaquinable || ing.diarioUltimaMilla)) {
        // Columna H (Maquinable) + Columna I (No maquinable) = Imposición
        imp = (ing.diarioMaquinable || 0) + (ing.diarioNoMaquinable || 0);
        // Columna J (Última milla) = Jurisdicción
        jur = ing.diarioUltimaMilla || 0;
      } else {
        imp = n.volumenVentaNum || 0;
        jur = n.volumenJurisdiccionNum || 0;
      }
      totalImposicion += imp;
      totalJurisdiccion += jur;
      totalVolumen += (imp + jur);
    });

    const totalDotacion = data.reduce((acc, n) => acc + (n.dotacionTotal || 0), 0);
    const totalAuxiliares = data.reduce((acc, n) => acc + (n.dotacionAuxiliares || 0), 0);

    const elVol = document.getElementById("akpi-volumen");
    const elVolSub = document.getElementById("akpi-volumen-sub");
    if (elVol) elVol.textContent = Math.round(totalVolumen).toLocaleString("es-AR");
    if (elVolSub) {
      elVolSub.innerHTML = `Promedio diario de imposición más jurisdicción<br><span style="color:#0284c7; font-weight:600;">${Math.round(totalImposicion).toLocaleString("es-AR")} Imp. · ${Math.round(totalJurisdiccion).toLocaleString("es-AR")} Jur.</span>`;
    }

    // Actualizar gráfico de fondo (sparkline dinámico según las plantas de la región)
    const volumenes = data.map(n => {
      const ing = n.ingresoEnvios;
      if (ing && (ing.diarioMaquinable || ing.diarioNoMaquinable || ing.diarioUltimaMilla)) {
        return (ing.diarioMaquinable || 0) + (ing.diarioNoMaquinable || 0) + (ing.diarioUltimaMilla || 0);
      }
      return (n.volumenVentaNum || 0) + (n.volumenJurisdiccionNum || 0);
    });
    const sparkD = calcularRutaSparkline(volumenes, 140, 28);
    const elSpark = document.getElementById("sparkline-path");
    const elArea = document.getElementById("sparkline-area");
    if (elSpark) elSpark.setAttribute("d", sparkD);
    if (elArea) elArea.setAttribute("d", `${sparkD} L 140,28 L 0,28 Z`);

    const elPlantas = document.getElementById("akpi-plantas");
    const elPlantasSub = document.getElementById("akpi-plantas-sub");
    if (elPlantas) elPlantas.textContent = totalPlantas;
    if (elPlantasSub) {
      const clogs = data.filter(n => n.tipo === "CLOG").length;
      const ctps = data.filter(n => n.tipo === "CTP").length;
      if (ctps > 0) {
        elPlantasSub.textContent = `${clogs} CLOG · ${ctps} CTP`;
      } else {
        elPlantasSub.textContent = `${clogs} CLOG`;
      }
    }

    const elDot = document.getElementById("akpi-dotacion");
    const elDotSub = document.getElementById("akpi-dotacion-sub");
    if (elDot) {
      elDot.textContent = totalDotacion.toLocaleString("es-AR");
      if (elDotSub) {
        elDotSub.innerHTML = `<span style="color:#0284c7; font-weight:700;">${totalAuxiliares.toLocaleString("es-AR")}</span> auxiliares operativos`;
      }
    }

    // Total de superficie que abarca la totalidad de centros logísticos (incluyendo CTP BUE, Tortuguitas TRT, Tierra del Fuego y toda la red)
    const datasetSuperficie = (regionKey === "nacional" || !regionKey)
      ? NODOS_DATA_OFICIAL
      : NODOS_DATA_OFICIAL.filter(n => n.regionKey === regionKey);
    const totalM2 = datasetSuperficie.reduce((acc, n) => {
      const num = (typeof n.capacidadM2 === "number" && n.capacidadM2 > 0)
        ? n.capacidadM2
        : (n.capacidad ? parseFloat(n.capacidad.replace(/[^0-9]/g, "")) : 0);
      return acc + (num || 0);
    }, 0);
    const cantPlantasSuperficie = datasetSuperficie.length;

    const elM2 = document.getElementById("akpi-superficie");
    const elM2Sub = document.getElementById("akpi-superficie-sub");
    if (elM2) elM2.textContent = `${totalM2.toLocaleString("es-AR")} m²`;
    if (elM2Sub) {
      const promM2 = cantPlantasSuperficie ? Math.round(totalM2 / cantPlantasSuperficie) : 0;
      elM2Sub.textContent = `Promedio ${promM2.toLocaleString("es-AR")} m² / planta`;
    }

    // Turnos Reales del Excel (Jerárquico + Auxiliares)
    let tn = 0, tm = 0, tt = 0;
    let jn = 0, an = 0;
    let jm = 0, am = 0;
    let jt = 0, at = 0;

    data.forEach(n => {
      const t = n.turnos || {};
      const dj_n = parseInt(t.noche?.jerarquico || 0) || 0;
      const da_n = parseInt(t.noche?.auxiliares || 0) || 0;
      const dj_m = parseInt(t.manana?.jerarquico || 0) || 0;
      const da_m = parseInt(t.manana?.auxiliares || 0) || 0;
      const dj_t = parseInt(t.tarde?.jerarquico || 0) || 0;
      const da_t = parseInt(t.tarde?.auxiliares || 0) || 0;

      jn += dj_n; an += da_n; tn += (dj_n + da_n);
      jm += dj_m; am += da_m; tm += (dj_m + da_m);
      jt += dj_t; at += da_t; tt += (dj_t + da_t);
    });

    const totTurnos = tn + tm + tt;
    const maxTurno = Math.max(tn, tm, tt);
    let nombreMax = "Mañana";
    let auxMax = am;
    if (maxTurno === tn) { nombreMax = "Noche"; auxMax = an; }
    if (maxTurno === tt) { nombreMax = "Tarde"; auxMax = at; }

    const elTurno = document.getElementById("akpi-turno");
    const elTurnoSub = document.getElementById("akpi-turno-sub");
    if (elTurno) elTurno.textContent = `Turno ${nombreMax}`;
    if (elTurnoSub) {
      const pct = totTurnos ? ((maxTurno / totTurnos) * 100).toFixed(1).replace(".", ",") : "0";
      elTurnoSub.innerHTML = `<strong style="color:#002554;">${maxTurno} pers.</strong> (${pct}%) · ${auxMax} aux.`;
    }

    // Actualizar las 3 tarjetas de turnos de la sección
    const elBoxM = document.getElementById("turno-box-manana");
    const elBoxMSub = document.getElementById("turno-box-manana-sub");
    const elBoxT = document.getElementById("turno-box-tarde");
    const elBoxTSub = document.getElementById("turno-box-tarde-sub");
    const elBoxN = document.getElementById("turno-box-noche");
    const elBoxNSub = document.getElementById("turno-box-noche-sub");

    if (elBoxM) elBoxM.textContent = `${tm} pers.`;
    if (elBoxMSub) elBoxMSub.textContent = `${am} Auxiliares · ${jm} Jerárquicos`;
    if (elBoxT) elBoxT.textContent = `${tt} pers.`;
    if (elBoxTSub) elBoxTSub.textContent = `${at} Auxiliares · ${jt} Jerárquicos`;
    if (elBoxN) elBoxN.textContent = `${tn} pers.`;
    if (elBoxNSub) elBoxNSub.textContent = `${an} Auxiliares · ${jn} Jerárquicos`;

    // Calidad SLA Paq.AR y FV (Maestro KPIs)
    const elSla = document.getElementById("akpi-sla");
    const elSlaSub = document.getElementById("akpi-sla-sub");
    const elFv = document.getElementById("akpi-fv");
    const elFvSub = document.getElementById("akpi-fv-sub");

    let totalSlaWeight = 0;
    let totalFvWeight = 0;
    let totalWeight = 0;
    data.forEach(n => {
      const vol = (n.volumenTotalNum && n.volumenTotalNum > 0) ? n.volumenTotalNum : 1;
      const slaVal = (n.calidad && n.calidad.slaPaqAr !== undefined) ? n.calidad.slaPaqAr : 96.5;
      const fvVal = (n.calidad && n.calidad.fvPaqAr !== undefined) ? n.calidad.fvPaqAr : 85.4;
      totalSlaWeight += slaVal * vol;
      totalFvWeight += fvVal * vol;
      totalWeight += vol;
    });

    const REGION_FV_OFICIAL = {
      "nacional": 85.4,
      "amba": 88.9,
      "pba": 87.0,
      "cuyo": 83.0,
      "patagonia": 82.9,
      "centro": 82.6
    };

    const slaProm = regionKey === "nacional" ? 96.5 : (totalWeight > 0 ? (totalSlaWeight / totalWeight) : 96.5);
    const fvProm = REGION_FV_OFICIAL[regionKey] !== undefined ? REGION_FV_OFICIAL[regionKey] : (totalWeight > 0 ? (totalFvWeight / totalWeight) : 85.4);

    if (elSla) elSla.textContent = `${slaProm.toFixed(1).replace(".", ",")}%`;
    if (elSlaSub) {
      elSlaSub.innerHTML = regionKey === "nacional"
        ? `<span style="color:#16a34a; font-weight:700;">Nivel de Servicio Cumplido</span><br>Objetivo Paq.AR en plazo`
        : `<span style="color:#16a34a; font-weight:700;">SLA Regional Ponderado</span><br>Cumplimiento Paq.AR`;
    }

    if (elFv) elFv.textContent = `${fvProm.toFixed(1).replace(".", ",")}%`;
    if (elFvSub) {
      elFvSub.innerHTML = regionKey === "nacional"
        ? `<span style="color:#0284c7; font-weight:700;">Efectividad en 1ª Visita</span><br>Paq.AR a Domicilio Total País`
        : `<span style="color:#0284c7; font-weight:700;">FV Regional Ponderado</span><br>Efectividad en 1ª Visita`;
    }

    // Piezas Postales 2D (Info Plantas Julio - Columna G)
    let totalPostal2D = data.reduce((acc, n) => acc + (n.volumen2DNum || 0), 0);
    let totalPostal2DMensual = data.reduce((acc, n) => acc + (n.volumen2dMensualNum || 0), 0);

    const elPostal2D = document.getElementById("akpi-postal2d");
    const elPostal2DSub = document.getElementById("akpi-postal2d-sub");
    if (elPostal2D) {
      elPostal2D.textContent = totalPostal2D > 0 ? Math.round(totalPostal2D).toLocaleString("es-AR") : "0";
      if (elPostal2DSub) {
        if (totalPostal2DMensual > 0) {
          elPostal2DSub.innerHTML = `Promedio diario piezas postales 2D (Auditado)<br><span style="color:#6366f1; font-weight:600;">${Math.round(totalPostal2DMensual).toLocaleString("es-AR")} mensual</span>`;
        } else {
          elPostal2DSub.innerHTML = `Promedio diario piezas postales 2D (Auditado)<br><span style="color:#6366f1; font-weight:600;">Piezas postales tradicionales (excluido de paquetería)</span>`;
        }
      }
    }

    // Tarjetas de resumen de la sección SLA Paq.AR
    const elSlaNac = document.getElementById("kpi-sla-nac");
    const elSlaOpt = document.getElementById("kpi-sla-nodos-optimos");
    const elSlaAle = document.getElementById("kpi-sla-nodos-alerta");

    if (elSlaNac) elSlaNac.textContent = `${slaProm.toFixed(1).replace(".", ",")}%`;
    const nodosSlaOptimo = data.filter(n => (n.calidad?.slaPaqAr || 96.5) >= 96).length;
    const nodosSlaAlerta = data.filter(n => (n.calidad?.slaPaqAr || 96.5) < 95).length;
    if (elSlaOpt) elSlaOpt.textContent = `${nodosSlaOptimo} / ${data.length}`;
    if (elSlaAle) elSlaAle.textContent = `${nodosSlaAlerta} / ${data.length}`;

    // Tarjetas de resumen de la sección FV (1ª Visita)
    const elFvNac = document.getElementById("kpi-fv-nac");
    const elFvOpt = document.getElementById("kpi-fv-nodos-destacados");
    const elFvAle = document.getElementById("kpi-fv-nodos-alerta");

    if (elFvNac) elFvNac.textContent = `${fvProm.toFixed(1).replace(".", ",")}%`;
    const nodosFvOptimo = data.filter(n => (n.calidad?.fvPaqAr || 85.4) >= 85).length;
    const nodosFvAlerta = data.filter(n => (n.calidad?.fvPaqAr || 85.4) < 80).length;
    if (elFvOpt) elFvOpt.textContent = `${nodosFvOptimo} / ${data.length}`;
    if (elFvAle) elFvAle.textContent = `${nodosFvAlerta} / ${data.length}`;
  }

  // =============================================================
  // 2. CONFIGURACIÓN Y ACTUALIZACIÓN DE GRÁFICOS
  // =============================================================
  Chart.defaults.font.family = "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = "#556987";
  Chart.defaults.plugins.tooltip.backgroundColor = "#002554";
  Chart.defaults.plugins.tooltip.titleColor = "#FFD200";
  Chart.defaults.plugins.tooltip.titleFont = { weight: "bold", size: 13 };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;

  function inicializarGraficos() {
    const data = getFilteredData(currentRegion);

    // ---------------------------------------------------------
    // Gráfico 1: Top 10 Plantas por Volumen
    // ---------------------------------------------------------
    const ctxTop = document.getElementById("chart-top-volumen")?.getContext("2d");
    if (ctxTop) {
      const top10 = [...data]
        .sort((a, b) => (b.volumenTotalNum || 0) - (a.volumenTotalNum || 0))
        .slice(0, 10);

      chartTopVolumen = new Chart(ctxTop, {
        type: "bar",
        data: {
          labels: top10.map(p => `${p.cod} - ${p.nombre}`),
          datasets: [{
            label: "Envíos Diarios Totales",
            data: top10.map(p => p.volumenTotalNum || 0),
            backgroundColor: top10.map((_, i) => i === 0 ? COLOR_AMARILLO : COLOR_AZUL_DARK),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` Volumen: ${ctx.parsed.y.toLocaleString("es-AR")} envíos/día`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxRotation: 45, minRotation: 20 }
            },
            y: {
              beginAtZero: true,
              grid: { color: "#edf2f7" },
              ticks: {
                callback: v => v >= 1000 ? `${(v / 1000).toLocaleString("es-AR")}k` : v
              }
            }
          }
        }
      });
    }

    // ---------------------------------------------------------
    // Gráfico 2: Cuota de Volumen por Región
    // ---------------------------------------------------------
    const ctxCuota = document.getElementById("chart-cuota-region")?.getContext("2d");
    if (ctxCuota) {
      const volPorRegion = {
        "AMBA": 0,
        "PBA / La Pampa": 0,
        "Centro / NEA": 0,
        "Cuyo / NOA": 0,
        "Patagonia / Sur": 0
      };

      NODOS_ANALYTICS.forEach(n => {
        const v = n.volumenTotalNum || 0;
        if (n.regionKey === "amba") volPorRegion["AMBA"] += v;
        else if (n.regionKey === "pba") volPorRegion["PBA / La Pampa"] += v;
        else if (n.regionKey === "centro") volPorRegion["Centro / NEA"] += v;
        else if (n.regionKey === "cuyo") volPorRegion["Cuyo / NOA"] += v;
        else if (n.regionKey === "patagonia") volPorRegion["Patagonia / Sur"] += v;
      });

      chartCuotaRegion = new Chart(ctxCuota, {
        type: "doughnut",
        data: {
          labels: Object.keys(volPorRegion),
          datasets: [{
            data: Object.values(volPorRegion),
            backgroundColor: [COLOR_AMARILLO, COLOR_AZUL_DARK, COLOR_CYAN, COLOR_ORANGE, COLOR_PURPLE],
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const val = ctx.parsed;
                  const total = Object.values(volPorRegion).reduce((a, b) => a + b, 0);
                  const pct = total ? ((val / total) * 100).toFixed(1) : 0;
                  return ` ${ctx.label}: ${val.toLocaleString("es-AR")} (${pct}%)`;
                }
              }
            }
          },
          cutout: "68%"
        }
      });
    }

    // ---------------------------------------------------------
    // Gráfico 5: Turnos (Stacked Bar Chart: Auxiliares + Jerárquicos)
    // ---------------------------------------------------------
    const ctxTurnos = document.getElementById("chart-distribucion-turnos")?.getContext("2d");
    if (ctxTurnos) {
      let jn = 0, an = 0;
      let jm = 0, am = 0;
      let jt = 0, at = 0;

      data.forEach(n => {
        const t = n.turnos || {};
        jn += parseInt(t.noche?.jerarquico || 0) || 0;
        an += parseInt(t.noche?.auxiliares || 0) || 0;
        jm += parseInt(t.manana?.jerarquico || 0) || 0;
        am += parseInt(t.manana?.auxiliares || 0) || 0;
        jt += parseInt(t.tarde?.jerarquico || 0) || 0;
        at += parseInt(t.tarde?.auxiliares || 0) || 0;
      });

      chartTurnos = new Chart(ctxTurnos, {
        type: "bar",
        data: {
          labels: ["Turno Mañana (04:00 a 13:00)", "Turno Tarde (13:00 a 22:00)", "Turno Noche (20:00 a 04:00)"],
          datasets: [
            {
              label: "Auxiliares Operativos",
              data: [am, at, an],
              backgroundColor: "#0284c7",
              borderRadius: 5,
              stack: "Stack 0"
            },
            {
              label: "Personal Jerárquico / Supervisión",
              data: [jm, jt, jn],
              backgroundColor: "#7c3aed",
              borderRadius: 5,
              stack: "Stack 0"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "top",
              align: "end",
              labels: { boxWidth: 12, padding: 14, font: { weight: "600" } }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} personas`,
                afterBody: items => {
                  const idx = items[0].dataIndex;
                  const tots = [am + jm, at + jt, an + jn];
                  const sumTotal = (am + jm) + (at + jt) + (an + jn);
                  const val = tots[idx];
                  const pct = sumTotal ? ((val / sumTotal) * 100).toFixed(1) : 0;
                  return [
                    ` ─────── Total del Turno ───────`,
                    ` Dotación Total: ${val} personas (${pct}%)`
                  ];
                }
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true,
              beginAtZero: true,
              grid: { color: "#edf2f7" },
              ticks: { stepSize: 100 }
            }
          }
        }
      });
    }

    // ---------------------------------------------------------
    // Gráfico: Composición Regional Imposición vs Jurisdicción
    // ---------------------------------------------------------
    const ctxVolBarras = document.getElementById("chart-volumen-barras-regional")?.getContext("2d");
    if (ctxVolBarras) {
      const TOTAL_PAIS = 215333;
      const datosImp = [72658, 22778, 7426, 2438];
      const datosJur = [46563, 34901, 14076, 14494];
      const totalesRegion = [119222, 57679, 21501, 16932];
      const pctsRegion = ["55,4%", "26,8%", "10,0%", "7,9%"];
      const pctsImp = ["33,7%", "10,6%", "3,4%", "1,1%"];
      const pctsJur = ["21,6%", "16,2%", "6,5%", "6,7%"];

      chartVolumenBarrasRegional = new Chart(ctxVolBarras, {
        type: "bar",
        data: {
          labels: [
            ["PBA / LA PAMPA", "Total: 55,4%"],
            ["CENTRO / NEA", "Total: 26,8%"],
            ["CUYO / NOA", "Total: 10,0%"],
            ["Patagonia / SUR", "Total: 7,9%"]
          ],
          datasets: [
            {
              label: "Imposición diaria (Col. H + I)",
              data: datosImp,
              backgroundColor: "#002554",
              borderRadius: 5,
              barPercentage: 0.72,
              categoryPercentage: 0.65
            },
            {
              label: "Jurisdicción última milla (Col. J)",
              data: datosJur,
              backgroundColor: "#0284c7",
              borderRadius: 5,
              barPercentage: 0.72,
              categoryPercentage: 0.65
            }
          ]
        },
        plugins: [
          {
            id: "barValueLabelsVol",
            afterDatasetsDraw(chart) {
              const { ctx } = chart;
              ctx.save();

              const metaImp = chart.getDatasetMeta(0);
              const metaJur = chart.getDatasetMeta(1);

              metaImp.data.forEach((barImp, idx) => {
                const barJur = metaJur.data[idx];
                const valImp = chart.data.datasets[0].data[idx];
                const valJur = chart.data.datasets[1].data[idx];
                const pImp = pctsImp[idx];
                const pJur = pctsJur[idx];
                const totReg = totalesRegion[idx];
                const pTot = pctsRegion[idx];

                // 1. Etiqueta sobre barra de Imposición: valor y porcentaje de la barra
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
                ctx.fillStyle = "#002554";
                ctx.fillText(valImp.toLocaleString("es-AR"), barImp.x, barImp.y - 17);
                ctx.font = "bold 10px 'Plus Jakarta Sans', sans-serif";
                ctx.fillStyle = "#475569";
                ctx.fillText(`(${pImp})`, barImp.x, barImp.y - 4);

                // 2. Etiqueta sobre barra de Jurisdicción: valor y porcentaje de la barra
                ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
                ctx.fillStyle = "#0284c7";
                ctx.fillText(valJur.toLocaleString("es-AR"), barJur.x, barJur.y - 17);
                ctx.font = "bold 10px 'Plus Jakarta Sans', sans-serif";
                ctx.fillStyle = "#475569";
                ctx.fillText(`(${pJur})`, barJur.x, barJur.y - 4);

                // 3. Insignia consolidada de la región (Suma de las dos barras respecto del total)
                const centerX = (barImp.x + barJur.x) / 2;
                const minY = Math.min(barImp.y, barJur.y);
                const pillY = minY - 34;
                const pillText = `Total: ${totReg.toLocaleString("es-AR")} (${pTot})`;

                ctx.font = "bold 10.5px 'Plus Jakarta Sans', sans-serif";
                const textWidth = ctx.measureText(pillText).width;
                const padX = 8;
                const pillW = textWidth + padX * 2;
                const pillH = 19;
                const pillX = centerX - pillW / 2;

                // Fondo y borde del pill
                ctx.fillStyle = "#f8fafc";
                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                  ctx.roundRect(pillX, pillY - pillH + 4, pillW, pillH, 6);
                } else {
                  ctx.rect(pillX, pillY - pillH + 4, pillW, pillH);
                }
                ctx.fill();
                ctx.stroke();

                // Texto del pill
                ctx.fillStyle = "#0f172a";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(pillText, centerX, pillY - pillH / 2 + 4);
              });

              ctx.restore();
            }
          }
        ],
        options: {
          indexAxis: "x",
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              top: 38,
              right: 14,
              left: 14,
              bottom: 6
            }
          },
          plugins: {
            legend: {
              display: true,
              position: "top",
              align: "end",
              labels: {
                usePointStyle: true,
                pointStyle: "rectRounded",
                boxWidth: 10,
                boxHeight: 10,
                padding: 14,
                font: { family: "Plus Jakarta Sans, sans-serif", size: 11.5, weight: "700" },
                color: "#334155"
              }
            },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const val = ctx.parsed.y;
                  const pct = ((val / TOTAL_PAIS) * 100).toFixed(1).replace(".", ",");
                  return ` ${ctx.dataset.label}: ${val.toLocaleString("es-AR")} env/día (${pct}% del total país)`;
                },
                afterBody: items => {
                  const idx = items[0].dataIndex;
                  const totReg = totalesRegion[idx];
                  const pTot = pctsRegion[idx];
                  return [
                    "",
                    ` ─────── Consolidado Regional ───────`,
                    ` Total Región: ${totReg.toLocaleString("es-AR")} env/día`,
                    ` Suma Regional: ${pTot} del total país`
                  ];
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 90000,
              grid: { color: "#f1f5f9" },
              ticks: {
                stepSize: 20000,
                font: { size: 11, family: "Plus Jakarta Sans, sans-serif" },
                color: "#64748b",
                callback: val => val.toLocaleString("es-AR")
              }
            },
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 11.5, weight: "800", family: "Plus Jakarta Sans, sans-serif" },
                color: "#0f172a"
              }
            }
          }
        }
      });
    }
    // Gráfico 9: Ingreso de Envíos Maquinables vs No Maquinables (Sheets 2 a 5)
    // ---------------------------------------------------------
    const ctxIngMaq = document.getElementById("chart-ingresos-maquinables")?.getContext("2d");
    if (ctxIngMaq) {
      const plantasConIngreso = NODOS_ANALYTICS
        .filter(n => n.ingresoEnvios && n.ingresoEnvios.impoMensual > 0)
        .sort((a, b) => b.ingresoEnvios.impoMensual - a.ingresoEnvios.impoMensual)
        .slice(0, 12);

      chartIngresosMaq = new Chart(ctxIngMaq, {
        type: "bar",
        data: {
          labels: plantasConIngreso.map(p => `${p.cod} (${p.nombre})`),
          datasets: [
            {
              label: "Maquinable (Sorter Mecánico)",
              data: plantasConIngreso.map(p => p.ingresoEnvios.impoMensualMaquinable || 0),
              backgroundColor: "#0284c7",
              borderRadius: 4
            },
            {
              label: "No Maquinable (Manual / Irregular)",
              data: plantasConIngreso.map(p => p.ingresoEnvios.impoMensualNoMaquinable || 0),
              backgroundColor: "#f59e0b",
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString("es-AR")} envíos/mes`
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 35, minRotation: 20 } },
            y: {
              stacked: true,
              beginAtZero: true,
              grid: { color: "#edf2f7" },
              ticks: { callback: v => v >= 1000 ? `${(v / 1000).toLocaleString("es-AR")}k` : v }
            }
          }
        }
      });
    }

  }

  // =============================================================
  // 3. ACTUALIZAR GRÁFICOS AL CAMBIAR DE REGIÓN
  // =============================================================
  function actualizarGraficosRegion(regionKey) {
    const data = getFilteredData(regionKey);

    // 1. Top 10
    if (chartTopVolumen) {
      const top10 = [...data]
        .sort((a, b) => (b.volumenTotalNum || 0) - (a.volumenTotalNum || 0))
        .slice(0, 10);
      chartTopVolumen.data.labels = top10.map(p => `${p.cod} - ${p.nombre}`);
      chartTopVolumen.data.datasets[0].data = top10.map(p => p.volumenTotalNum || 0);
      chartTopVolumen.data.datasets[0].backgroundColor = top10.map((_, i) => i === 0 ? COLOR_AMARILLO : COLOR_AZUL_DARK);
      chartTopVolumen.update();
    }

    // 5. Turnos
    if (chartTurnos) {
      let jn = 0, an = 0;
      let jm = 0, am = 0;
      let jt = 0, at = 0;

      data.forEach(n => {
        const t = n.turnos || {};
        jn += parseInt(t.noche?.jerarquico || 0) || 0;
        an += parseInt(t.noche?.auxiliares || 0) || 0;
        jm += parseInt(t.manana?.jerarquico || 0) || 0;
        am += parseInt(t.manana?.auxiliares || 0) || 0;
        jt += parseInt(t.tarde?.jerarquico || 0) || 0;
        at += parseInt(t.tarde?.auxiliares || 0) || 0;
      });

      chartTurnos.data.datasets[0].data = [am, at, an];
      chartTurnos.data.datasets[1].data = [jm, jt, jn];
      chartTurnos.update();
    }
  }

  // =============================================================
  // 4. TABLA DE DETALLE ANALÍTICO DE PLANTAS
  // =============================================================
  function renderTabla() {
    const tbody = document.getElementById("analytics-table-body");
    const countEl = document.getElementById("table-count-label");
    if (!tbody) return;

    let data = getFilteredData(currentRegion);

    // Filtro por texto de búsqueda
    if (currentSearch.trim()) {
      const q = currentSearch.toLowerCase().trim();
      data = data.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.cod && p.cod.toLowerCase().includes(q)) ||
        (p.provincia && p.provincia.toLowerCase().includes(q)) ||
        (p.tipo && p.tipo.toLowerCase().includes(q)) ||
        (p.responsables?.jefePlanta && p.responsables.jefePlanta.toLowerCase().includes(q))
      );
    }

    // Ordenamiento
    data.sort((a, b) => {
      let va = a[sortColumn];
      let vb = b[sortColumn];

      if (sortColumn === "responsables") {
        va = a.responsables?.jefePlanta || "";
        vb = b.responsables?.jefePlanta || "";
      }

      if (sortColumn === "sla") {
        va = a.calidad?.slaPaqAr || 0;
        vb = b.calidad?.slaPaqAr || 0;
      }

      if (sortColumn === "fv") {
        va = a.calidad?.fvPaqAr || 0;
        vb = b.calidad?.fvPaqAr || 0;
      }

      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();

      if (va < vb) return sortDirection === "asc" ? -1 : 1;
      if (va > vb) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    if (countEl) {
      countEl.textContent = `Mostrando ${data.length} de ${NODOS_ANALYTICS.length} plantas`;
    }

    tbody.innerHTML = "";
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:24px;color:#64748b;">No se encontraron plantas para los filtros seleccionados.</td></tr>`;
      return;
    }

    data.forEach(p => {
      const tr = document.createElement("tr");

      let tipoClass = "tipo-clog-badge";
      if (p.tipo === "Sorter" || p.tipo === "SORTER") tipoClass = "tipo-sorter-badge";
      if (p.tipo === "CDP") tipoClass = "tipo-cdp-badge";
      if (p.tipo === "CTP") tipoClass = "tipo-ctp-badge";

      const tm = (parseInt(p.turnos?.manana?.jerarquico || 0) || 0) + (parseInt(p.turnos?.manana?.auxiliares || 0) || 0);
      const tt = (parseInt(p.turnos?.tarde?.jerarquico || 0) || 0) + (parseInt(p.turnos?.tarde?.auxiliares || 0) || 0);
      const tn = (parseInt(p.turnos?.noche?.jerarquico || 0) || 0) + (parseInt(p.turnos?.noche?.auxiliares || 0) || 0);

      const slaVal = (p.calidad && p.calidad.slaPaqAr !== undefined) ? `${p.calidad.slaPaqAr.toString().replace(".", ",")}%` : "96,5%";
      const fvVal = (p.calidad && p.calidad.fvPaqAr !== undefined) ? `${p.calidad.fvPaqAr.toString().replace(".", ",")}%` : "85,4%";

      tr.innerHTML = `
        <td><span class="table-pill-cod">${p.cod}</span></td>
        <td><strong>${p.nombreCompleto || p.nombre}</strong></td>
        <td><span class="table-pill-tipo ${tipoClass}">${p.tipo}</span></td>
        <td>${p.provincia} (${p.region})</td>
        <td><strong>${(p.volumenTotalNum || 0).toLocaleString("es-AR")}</strong></td>
        <td>${(p.capacidadM2 || 0).toLocaleString("es-AR")} m²</td>
        <td><strong>${p.dotacionTotal || 0}</strong> <span style="font-size:11px;color:#64748b;">(${p.dotacionAuxiliares || 0} aux)</span></td>
        <td><span style="color:#0284c7;font-weight:700;">${tm > 0 ? `${tm} pers.` : "-"}</span></td>
        <td><span style="color:#d97706;font-weight:700;">${tt > 0 ? `${tt} pers.` : "-"}</span></td>
        <td><span style="color:#7c3aed;font-weight:700;">${tn > 0 ? `${tn} pers.` : "-"}</span></td>
        <td><span style="color:#16a34a;font-weight:700;">${slaVal}</span></td>
        <td><span style="color:#0284c7;font-weight:700;">${fvVal}</span></td>
        <td>${p.responsables?.jefePlanta || "S/D"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Ordenamiento de tabla por clic en cabecera
  document.querySelectorAll(".analytics-table th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort");
      if (sortColumn === col) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = col;
        sortDirection = "desc";
      }

      document.querySelectorAll(".analytics-table th[data-sort]").forEach(el => {
        el.classList.remove("sorted-asc", "sorted-desc");
      });
      th.classList.add(sortDirection === "asc" ? "sorted-asc" : "sorted-desc");

      renderTabla();
    });
  });

  // Buscador de tabla de plantas
  const searchInput = document.getElementById("table-search");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      currentSearch = e.target.value;
      renderTabla();
    });
  }

  // =============================================================
  // 4b. TABLA DE SLA PAQ.AR (36 NODOS)
  // =============================================================
  function renderTablaSla() {
    const tbody = document.getElementById("sla-table-body");
    const countEl = document.getElementById("sla-table-count");
    if (!tbody) return;

    let data = getFilteredData(currentRegion);

    // Filtro de búsqueda
    if (currentSlaSearch.trim()) {
      const q = currentSlaSearch.toLowerCase().trim();
      data = data.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.cod && p.cod.toLowerCase().includes(q)) ||
        (p.provincia && p.provincia.toLowerCase().includes(q)) ||
        (p.region && p.region.toLowerCase().includes(q)) ||
        (p.tipo && p.tipo.toLowerCase().includes(q))
      );
    }

    // Ordenamiento
    data.sort((a, b) => {
      let va, vb;
      if (sortSlaCol === "cod") {
        va = a.cod || ""; vb = b.cod || "";
      } else if (sortSlaCol === "nombre") {
        va = a.nombreCompleto || a.nombre || ""; vb = b.nombreCompleto || b.nombre || "";
      } else if (sortSlaCol === "tipo") {
        va = a.tipo || ""; vb = b.tipo || "";
      } else if (sortSlaCol === "provincia") {
        va = `${a.provincia} ${a.region}`; vb = `${b.provincia} ${b.region}`;
      } else if (sortSlaCol === "sla" || sortSlaCol === "desvio") {
        va = a.calidad?.slaPaqAr !== undefined ? a.calidad.slaPaqAr : 96.5;
        vb = b.calidad?.slaPaqAr !== undefined ? b.calidad.slaPaqAr : 96.5;
      } else if (sortSlaCol === "volumen") {
        va = a.volumenTotalNum || 0; vb = b.volumenTotalNum || 0;
      } else {
        va = a[sortSlaCol] || 0; vb = b[sortSlaCol] || 0;
      }

      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();

      if (va < vb) return sortSlaDir === "asc" ? -1 : 1;
      if (va > vb) return sortSlaDir === "asc" ? 1 : -1;
      return 0;
    });

    if (countEl) {
      countEl.textContent = `Mostrando ${data.length} de ${NODOS_ANALYTICS.length} nodos auditados`;
    }

    tbody.innerHTML = "";
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No se encontraron nodos logísticos para la búsqueda.</td></tr>`;
      return;
    }

    data.forEach(p => {
      const tr = document.createElement("tr");

      let tipoClass = "tipo-clog-badge";
      if (p.tipo === "Sorter" || p.tipo === "SORTER") tipoClass = "tipo-sorter-badge";
      if (p.tipo === "CDP") tipoClass = "tipo-cdp-badge";
      if (p.tipo === "CTP") tipoClass = "tipo-ctp-badge";

      const slaNum = p.calidad?.slaPaqAr !== undefined ? p.calidad.slaPaqAr : 96.5;
      const slaStr = slaNum.toString().replace(".", ",");
      const diffNum = slaNum - 96.0;
      const diffStr = Math.abs(diffNum).toFixed(1).replace(".", ",");

      let badgeSlaHtml = "";
      if (slaNum >= 97) {
        badgeSlaHtml = `<span class="cal-badge badge-sla-optimo">Excelente (≥97%)</span>`;
      } else if (slaNum >= 95) {
        badgeSlaHtml = `<span class="cal-badge badge-sla-bueno">Cumplido (≥95%)</span>`;
      } else {
        badgeSlaHtml = `<span class="cal-badge badge-sla-alerta">A Mejorar (<95%)</span>`;
      }

      let diffHtml = "";
      if (diffNum > 0) {
        diffHtml = `<span style="color:#16a34a; font-weight:800; font-size:12.5px;">+${diffStr}%</span>`;
      } else if (diffNum === 0) {
        diffHtml = `<span style="color:#64748b; font-weight:700; font-size:12.5px;">0,0%</span>`;
      } else {
        diffHtml = `<span style="color:#dc2626; font-weight:800; font-size:12.5px;">-${diffStr}%</span>`;
      }

      tr.innerHTML = `
        <td><span class="table-pill-cod">${p.cod}</span></td>
        <td><strong>${p.nombreCompleto || p.nombre}</strong></td>
        <td><span class="table-pill-tipo ${tipoClass}">${p.tipo}</span></td>
        <td>${p.provincia} <span style="font-size:11px; color:#64748b;">(${p.region})</span></td>
        <td>
          <div class="cal-val-wrap">
            <span class="cal-val-num sla-color">${slaStr}%</span>
            <div class="cal-progress-bar">
              <div class="cal-progress-fill sla-fill" style="width: ${Math.min(100, Math.max(0, slaNum))}%"></div>
            </div>
          </div>
        </td>
        <td>${badgeSlaHtml}</td>
        <td>${diffHtml}</td>
        <td><strong>${(p.volumenTotalNum || 0).toLocaleString("es-AR")}</strong> <span style="font-size:11px;color:#64748b;">env/día</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Ordenamiento de tabla SLA
  document.querySelectorAll("#tabla-sla-nodos th[data-sort-sla]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort-sla");
      if (sortSlaCol === col) {
        sortSlaDir = sortSlaDir === "asc" ? "desc" : "asc";
      } else {
        sortSlaCol = col;
        sortSlaDir = (col === "cod" || col === "nombre" || col === "tipo" || col === "provincia") ? "asc" : "desc";
      }

      document.querySelectorAll("#tabla-sla-nodos th[data-sort-sla]").forEach(el => {
        el.classList.remove("sorted-asc", "sorted-desc");
      });
      th.classList.add(sortSlaDir === "asc" ? "sorted-asc" : "sorted-desc");

      renderTablaSla();
    });
  });

  // Buscador SLA
  const slaSearchInput = document.getElementById("sla-search");
  if (slaSearchInput) {
    slaSearchInput.addEventListener("input", e => {
      currentSlaSearch = e.target.value;
      renderTablaSla();
    });
  }

  // =============================================================
  // 4c. TABLA DE FV (1ª VISITA) (36 NODOS)
  // =============================================================
  function renderTablaFv() {
    const tbody = document.getElementById("fv-table-body");
    const countEl = document.getElementById("fv-table-count");
    if (!tbody) return;

    let data = getFilteredData(currentRegion);

    // Filtro de búsqueda
    if (currentFvSearch.trim()) {
      const q = currentFvSearch.toLowerCase().trim();
      data = data.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.cod && p.cod.toLowerCase().includes(q)) ||
        (p.provincia && p.provincia.toLowerCase().includes(q)) ||
        (p.region && p.region.toLowerCase().includes(q)) ||
        (p.tipo && p.tipo.toLowerCase().includes(q))
      );
    }

    // Ordenamiento
    data.sort((a, b) => {
      let va, vb;
      if (sortFvCol === "cod") {
        va = a.cod || ""; vb = b.cod || "";
      } else if (sortFvCol === "nombre") {
        va = a.nombreCompleto || a.nombre || ""; vb = b.nombreCompleto || b.nombre || "";
      } else if (sortFvCol === "tipo") {
        va = a.tipo || ""; vb = b.tipo || "";
      } else if (sortFvCol === "provincia") {
        va = `${a.provincia} ${a.region}`; vb = `${b.provincia} ${b.region}`;
      } else if (sortFvCol === "fv" || sortFvCol === "desvio") {
        va = a.calidad?.fvPaqAr !== undefined ? a.calidad.fvPaqAr : 85.4;
        vb = b.calidad?.fvPaqAr !== undefined ? b.calidad.fvPaqAr : 85.4;
      } else if (sortFvCol === "volumen") {
        va = a.volumenTotalNum || 0; vb = b.volumenTotalNum || 0;
      } else {
        va = a[sortFvCol] || 0; vb = b[sortFvCol] || 0;
      }

      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();

      if (va < vb) return sortFvDir === "asc" ? -1 : 1;
      if (va > vb) return sortFvDir === "asc" ? 1 : -1;
      return 0;
    });

    if (countEl) {
      countEl.textContent = `Mostrando ${data.length} de ${NODOS_ANALYTICS.length} nodos auditados`;
    }

    tbody.innerHTML = "";
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No se encontraron nodos logísticos para la búsqueda.</td></tr>`;
      return;
    }

    data.forEach(p => {
      const tr = document.createElement("tr");

      let tipoClass = "tipo-clog-badge";
      if (p.tipo === "Sorter" || p.tipo === "SORTER") tipoClass = "tipo-sorter-badge";
      if (p.tipo === "CDP") tipoClass = "tipo-cdp-badge";
      if (p.tipo === "CTP") tipoClass = "tipo-ctp-badge";

      const fvNum = p.calidad?.fvPaqAr !== undefined ? p.calidad.fvPaqAr : 85.4;
      const fvStr = fvNum.toString().replace(".", ",");
      const diffNum = fvNum - 85.0;
      const diffStr = Math.abs(diffNum).toFixed(1).replace(".", ",");

      let badgeFvHtml = "";
      if (fvNum >= 90) {
        badgeFvHtml = `<span class="cal-badge badge-fv-optimo">Destacado (≥90%)</span>`;
      } else if (fvNum >= 82) {
        badgeFvHtml = `<span class="cal-badge badge-fv-bueno">Estándar (≥82%)</span>`;
      } else {
        badgeFvHtml = `<span class="cal-badge badge-fv-alerta">Atención (<82%)</span>`;
      }

      let diffHtml = "";
      if (diffNum > 0) {
        diffHtml = `<span style="color:#0284c7; font-weight:800; font-size:12.5px;">+${diffStr}%</span>`;
      } else if (diffNum === 0) {
        diffHtml = `<span style="color:#64748b; font-weight:700; font-size:12.5px;">0,0%</span>`;
      } else {
        diffHtml = `<span style="color:#dc2626; font-weight:800; font-size:12.5px;">-${diffStr}%</span>`;
      }

      tr.innerHTML = `
        <td><span class="table-pill-cod">${p.cod}</span></td>
        <td><strong>${p.nombreCompleto || p.nombre}</strong></td>
        <td><span class="table-pill-tipo ${tipoClass}">${p.tipo}</span></td>
        <td>${p.provincia} <span style="font-size:11px; color:#64748b;">(${p.region})</span></td>
        <td>
          <div class="cal-val-wrap">
            <span class="cal-val-num fv-color">${fvStr}%</span>
            <div class="cal-progress-bar">
              <div class="cal-progress-fill fv-fill" style="width: ${Math.min(100, Math.max(0, fvNum))}%"></div>
            </div>
          </div>
        </td>
        <td>${badgeFvHtml}</td>
        <td>${diffHtml}</td>
        <td><strong>${(p.volumenTotalNum || 0).toLocaleString("es-AR")}</strong> <span style="font-size:11px;color:#64748b;">env/día</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Ordenamiento de tabla FV
  document.querySelectorAll("#tabla-fv-nodos th[data-sort-fv]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort-fv");
      if (sortFvCol === col) {
        sortFvDir = sortFvDir === "asc" ? "desc" : "asc";
      } else {
        sortFvCol = col;
        sortFvDir = (col === "cod" || col === "nombre" || col === "tipo" || col === "provincia") ? "asc" : "desc";
      }

      document.querySelectorAll("#tabla-fv-nodos th[data-sort-fv]").forEach(el => {
        el.classList.remove("sorted-asc", "sorted-desc");
      });
      th.classList.add(sortFvDir === "asc" ? "sorted-asc" : "sorted-desc");

      renderTablaFv();
    });
  });

  // Buscador FV
  const fvSearchInput = document.getElementById("fv-search");
  if (fvSearchInput) {
    fvSearchInput.addEventListener("input", e => {
      currentFvSearch = e.target.value;
      renderTablaFv();
    });
  }

  // =============================================================
  // 5. TABLA Y FILTROS DE RED DE TRANSPORTE
  // =============================================================
  function renderTablaTransporte() {
    const tbody = document.getElementById("transporte-table-body");
    const infoEl = document.getElementById("transporte-filter-info");
    if (!tbody) return;

    const red = (typeof TRANSPORTE_RED_OFICIAL !== "undefined" && Array.isArray(TRANSPORTE_RED_OFICIAL))
      ? TRANSPORTE_RED_OFICIAL
      : [];

    let filtered = red;

    // Filtro por servicio
    if (currentTransportService !== "TODOS") {
      filtered = filtered.filter(t => t.tipoServicio && t.tipoServicio.toUpperCase().includes(currentTransportService.toUpperCase()));
    }

    // Filtro por texto
    if (currentTransportSearch.trim()) {
      const q = currentTransportSearch.toLowerCase().trim();
      filtered = filtered.filter(t =>
        (t.linea && t.linea.toLowerCase().includes(q)) ||
        (t.codPlanta && t.codPlanta.toLowerCase().includes(q)) ||
        (t.dependencia && t.dependencia.toLowerCase().includes(q)) ||
        (t.region && t.region.toLowerCase().includes(q)) ||
        (t.provincia && t.provincia.toLowerCase().includes(q))
      );
    }

    if (infoEl) {
      infoEl.textContent = `Mostrando ${filtered.length} de ${red.length} líneas de servicio`;
    }

    tbody.innerHTML = "";
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#64748b;">No se encontraron líneas de transporte para los filtros seleccionados.</td></tr>`;
      return;
    }

    // Limitamos la vista a las primeras 120 para fluidez en DOM
    filtered.slice(0, 120).forEach(t => {
      const tr = document.createElement("tr");

      let srvClass = "srv-adic";
      const s = (t.tipoServicio || "").toUpperCase();
      if (s.includes("LTC")) srvClass = "srv-ltc";
      else if (s.includes("BUE")) srvClass = "srv-bue";
      else if (s.includes("ATP")) srvClass = "srv-atp";
      else if (s.includes("LTN")) srvClass = "srv-ltn";

      tr.innerHTML = `
        <td><strong>${t.linea}</strong></td>
        <td><span class="table-pill-cod">${t.codPlanta}</span> ${t.dependencia || ""}</td>
        <td>${t.region}</td>
        <td><span class="chip-servicio ${srvClass}">${t.tipoServicio || "TR"}</span></td>
        <td>${t.frecuencia || "LUN A VIE"}</td>
        <td>${formatHorarioTransporte(t.horarioLlegada) || "-"}</td>
        <td>${formatHorarioTransporte(t.horarioSalida) || "-"}</td>
        <td>${formatHorarioTransporte(t.tiempoOperacion) || "-"}</td>
        <td>${t.distanciaKm ? `${t.distanciaKm} km` : "-"}</td>
        <td><strong>${t.capacidadBodega || "-"}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function formatHorarioTransporte(val) {
    if (!val) return "";
    const str = String(val).trim();
    if (str === "-" || str === "0" || str.toLowerCase() === "no" || str.toLowerCase() === "s/d" || str.toLowerCase() === "no hay") return "";
    if (/^\d{1,2}:\d{2}/.test(str)) return str.includes("hs") ? str : `${str} hs`;
    const clean = str.replace(",", ".");
    const num = parseFloat(clean);
    if (!isNaN(num) && num > 0 && num <= 1) {
      const totalMinutes = Math.round(num * 24 * 60);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const mins = totalMinutes % 60;
      const hh = String(hours).padStart(2, "0");
      const mm = String(mins).padStart(2, "0");
      return `${hh}:${mm} hs`;
    }
    if (!isNaN(num)) return "";
    return str;
  }

  // Configuración de chips de filtro de transporte
  const chipsCont = document.getElementById("transporte-filtros-servicio");
  if (chipsCont) {
    chipsCont.addEventListener("click", e => {
      const chip = e.target.closest(".trans-chip");
      if (!chip) return;
      chipsCont.querySelectorAll(".trans-chip").forEach(c => c.classList.remove("activo"));
      chip.classList.add("activo");
      currentTransportService = chip.getAttribute("data-servicio");
      renderTablaTransporte();
    });
  }

  const transSearch = document.getElementById("transporte-search");
  if (transSearch) {
    transSearch.addEventListener("input", e => {
      currentTransportSearch = e.target.value;
      renderTablaTransporte();
    });
  }

  // =============================================================
  // 6. EXPORTAR CSV
  // =============================================================
  const btnExport = document.getElementById("btn-exportar-csv");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const data = getFilteredData(currentRegion);
      let csv = "Codigo,Planta,Tipo,Provincia,Region,Volumen_Total,Volumen_Venta,Volumen_Jurisdiccion,Superficie_M2,Dotacion_Total,Auxiliares,Jefe_Planta,Jefe_Nodo\n";

      data.forEach(p => {
        const fila = [
          `"${p.cod}"`,
          `"${p.nombreCompleto || p.nombre}"`,
          `"${p.tipo}"`,
          `"${p.provincia}"`,
          `"${p.region}"`,
          p.volumenTotalNum || 0,
          p.volumenVentaNum || 0,
          p.volumenJurisdiccionNum || 0,
          p.capacidadM2 || 0,
          p.dotacionTotal || 0,
          p.dotacionAuxiliares || 0,
          `"${p.responsables?.jefePlanta || ''}"`,
          `"${p.responsables?.jefeNodo || ''}"`
        ];
        csv += fila.join(",") + "\n";
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `correo_argentino_analytics_${currentRegion}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // =============================================================
  // 7. CUSTOM SELECT (VISTA DE REGIÓN)
  // =============================================================
  const wrap = document.getElementById("custom-vista-wrap");
  const btn  = document.getElementById("custom-vista-btn");
  const list = document.getElementById("custom-vista-list");
  const label = document.getElementById("custom-vista-label");

  if (wrap && btn && list) {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const isOpen = wrap.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen);
    });

    list.addEventListener("click", e => {
      const option = e.target.closest(".custom-select-option");
      if (!option) return;

      list.querySelectorAll(".custom-select-option").forEach(el => el.classList.remove("selected"));
      option.classList.add("selected");
      if (label) label.textContent = option.textContent;

      const val = option.getAttribute("data-value");
      currentRegion = val;

      actualizarKPIs(val);
      actualizarGraficosRegion(val);
      renderTabla();
      renderTablaSla();
      renderTablaFv();

      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("click", e => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // =============================================================
  // 8. INTERACCIÓN DE PESTAÑAS (FILTRADO DE SECCIONES SIN SCROLL)
  // =============================================================
  const tabs = document.querySelectorAll(".analytics-tab");
  const sectionBlocks = document.querySelectorAll(".analytics-section-block");

  tabs.forEach(tab => {
    tab.addEventListener("click", e => {
      e.preventDefault();

      const targetTab = tab.getAttribute("data-tab");
      if (!targetTab) return;

      // 1. Cambiar estado visual de las pestañas
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // 2. Si es 'indicadores', mostramos TODO el tablero
      //    Si es otra pestaña, mostramos únicamente la sección correspondiente
      sectionBlocks.forEach(sec => {
        const secType = sec.getAttribute("data-tab-section");
        if (targetTab === "indicadores") {
          sec.style.display = "";
        } else if (secType === targetTab) {
          sec.style.display = "";
        } else {
          sec.style.display = "none";
        }
      });

      // 3. Reajustar gráficos Chart.js en la vista visible
      setTimeout(() => {
        if (chartVolumenBarrasRegional) {
          chartVolumenBarrasRegional.resize();
          chartVolumenBarrasRegional.update("none");
        }
        window.dispatchEvent(new Event("resize"));
      }, 50);
    });
  });

  // 9. Interacción con filas de tabla regional del resumen ejecutivo
  document.querySelectorAll(".opt-table-compact tbody tr").forEach((tr, idx) => {
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      const regKeys = ["pba", "centro", "cuyo", "patagonia"];
      const key = regKeys[idx];
      if (key) {
        const targetOpt = document.querySelector(`.custom-select-option[data-value="${key}"]`);
        if (targetOpt) targetOpt.click();
      }
    });
  });

  // Inicialización completa
  actualizarKPIs("nacional");
  inicializarGraficos();
  renderTabla();
  renderTablaSla();
  renderTablaFv();
  renderTablaTransporte();
});
