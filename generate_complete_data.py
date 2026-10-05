import zipfile
import xml.etree.ElementTree as ET
import json
import re

z = zipfile.ZipFile('data/Analisis plantas Logisticas act..xlsx')
sst_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
shared_strings = []
for si in sst_xml.findall('s:si', ns):
    t = si.find('s:t', ns)
    if t is not None:
        shared_strings.append(t.text or '')
    else:
        texts = [r.find('s:t', ns).text for r in si.findall('s:r', ns) if r.find('s:t', ns) is not None and r.find('s:t', ns).text]
        shared_strings.append(''.join(texts))

def clean_str(val):
    if val is None: return ""
    return str(val).strip()

def parse_num_clean(val):
    if not val: return 0.0
    val_str = str(val).strip()
    if ' a ' in val_str:
        parts = val_str.split(' a ')
        try:
            p1 = float(re.sub(r'[^0-9.]', '', parts[0]))
            p2 = float(re.sub(r'[^0-9.]', '', parts[1]))
            return round((p1 + p2) / 2.0, 1)
        except:
            pass
    clean = re.sub(r'[^0-9.]', '', val_str)
    try:
        return float(clean)
    except:
        return 0.0

def format_excel_time(val):
    if val is None or val == '': return ''
    try:
        f = float(val)
        if 0 <= f < 1:
            tot_min = round(f * 24 * 60)
            hh = (tot_min // 60) % 24
            mm = tot_min % 60
            return f"{hh:02d}:{mm:02d} hs"
        return str(val)
    except:
        return str(val)

def read_sheet_cells(sheet_file):
    root = ET.fromstring(z.read(f'xl/worksheets/{sheet_file}'))
    rows = {}
    for r in root.findall('.//s:row', ns):
        r_num = int(r.attrib.get('r', 0))
        cells = {}
        for c in r.findall('s:c', ns):
            ref = c.attrib.get('r')
            col = ''.join([ch for ch in ref if ch.isalpha()])
            t = c.attrib.get('t')
            v = c.find('s:v', ns)
            val = v.text if v is not None else ''
            if t == 's' and val != '':
                val = shared_strings[int(val)]
            cells[col] = val
        rows[r_num] = cells
    return rows

# =============================================================
# 1. PARSE SHEET 1: plantas
# =============================================================
sheet1_root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
plantas_rows = []
header_map = {}
for r_idx, r in enumerate(sheet1_root.findall('.//s:row', ns)):
    row_num = int(r.attrib.get('r', r_idx + 1))
    cells = {}
    for c in r.findall('s:c', ns):
        ref = c.attrib.get('r')
        col = ''.join([ch for ch in ref if ch.isalpha()])
        t = c.attrib.get('t')
        v = c.find('s:v', ns)
        val = v.text if v is not None else ''
        if t == 's' and val != '':
            val = shared_strings[int(val)]
        cells[col] = val
    if row_num == 1:
        header_map = cells
    else:
        named_row = {header_map.get(k, k): v for k, v in cells.items()}
        plantas_rows.append(named_row)

print(f"Sheet 1 (plantas): loaded {len(plantas_rows)} raw rows")

# =============================================================
# 2. PARSE SHEET 6: Resumen Ejecutivo y Recursos a Reubicar
# =============================================================
sheet6_rows = read_sheet_cells('sheet6.xml')

resumen_ejecutivo = []
for rnum in range(2, 6):
    c = sheet6_rows.get(rnum, {})
    reg = clean_str(c.get('A'))
    if reg:
        resumen_ejecutivo.append({
            'region': reg,
            'auxiliaresOperativos': int(parse_num_clean(c.get('C'))),
            'personalAReubicar': int(parse_num_clean(c.get('E'))),
            'pctAReubicar': round(float(c.get('F') or 0) * 100, 1),
            'costoMensualAuxiliar': parse_num_clean(c.get('I')),
            'costoEmpresaMensual': parse_num_clean(c.get('L')) if c.get('L') else 0,
            'costoEmpresaAnual': parse_num_clean(c.get('I') or c.get('K')) if rnum == 5 else 0
        })

# Total nacional en Resumen
c_tot = sheet6_rows.get(6, {})
resumen_nacional = {
    'totalAuxiliaresOperativos': int(parse_num_clean(c_tot.get('C')) or 648),
    'totalPersonalAReubicar': int(parse_num_clean(c_tot.get('E')) or 150),
    'pctNacionalAReubicar': 23.1,
    'costoAnualMas10': 3197778660,
    'costoAnualPromedio': 2831015736,
    'costoMensualMas10': 266481555,
    'costoMensualPromedio': 235917978
}

print(f"Sheet 6: Resumen ejecutivo cargado ({len(resumen_ejecutivo)} regiones, {resumen_nacional['totalPersonalAReubicar']} a reubicar)")

# Detalle unificado de optimización/recursos por planta desde Sheet 6 (filas 11-49)
plantas_optimizacion = {}
for rnum in range(11, 50):
    c = sheet6_rows.get(rnum, {})
    cod = clean_str(c.get('B'))
    if cod and len(cod) <= 5 and cod.upper() not in ['COD', 'REGION', 'CODIGO', 'TOTAL']:
        manip = parse_num_clean(c.get('I'))
        transp = parse_num_clean(c.get('J'))
        reubic = parse_num_clean(c.get('K'))
        plantas_optimizacion[cod] = {
            'regionSheet': clean_str(c.get('A')),
            'dotacionTotal': int(parse_num_clean(c.get('D'))),
            'auxiliaresOperativos': int(parse_num_clean(c.get('E'))),
            'auxNoche': int(parse_num_clean(c.get('F'))),
            'auxManana': int(parse_num_clean(c.get('G'))),
            'auxTarde': int(parse_num_clean(c.get('H'))),
            'manipularPaquetes': int(manip),
            'transporte': int(transp),
            'aReubicar': int(reubic),
            'necesariosTotal': int(manip + transp)
        }

print(f"Sheet 6: Optimización detallada para {len(plantas_optimizacion)} plantas")

# =============================================================
# 3. PARSE SHEETS 2-5: Detalle Ingreso de Envíos y Transporte
# =============================================================
regional_ingresos = {}
regional_transportes = []

reg_sheets = [
    ('SUR', 'sheet2.xml', 13, 17, 22),
    ('CUYO NOA', 'sheet3.xml', 16, 24, 30),
    ('CENTRO NEA', 'sheet4.xml', 15, 21, 27),
    ('PBA', 'sheet5.xml', 12, 16, 21)
]

for sname, sfile, ing_start, ing_end, tr_start in reg_sheets:
    rows = read_sheet_cells(sfile)
    print(f"Reading {sname} ({sfile})...")

    # A) Detalle ingreso de envíos
    for rnum in range(ing_start, ing_end + 1):
        c = rows.get(rnum, {})
        cod = clean_str(c.get('B'))
        if cod and len(cod) <= 5 and cod.upper() not in ['COD', 'REGION', 'CODIGO']:
            impo_m = parse_num_clean(c.get('D'))
            impo_maq = parse_num_clean(c.get('E'))
            impo_nomaq = parse_num_clean(c.get('F'))
            impo_um = parse_num_clean(c.get('G'))
            dia_maq = parse_num_clean(c.get('H'))
            dia_nomaq = parse_num_clean(c.get('I'))
            dia_um = parse_num_clean(c.get('J'))

            regional_ingresos[cod] = {
                'impoMensual': impo_m,
                'impoMensualMaquinable': impo_maq,
                'impoMensualNoMaquinable': impo_nomaq,
                'ingresoMensualUltimaMilla': impo_um,
                'diarioMaquinable': dia_maq,
                'diarioNoMaquinable': dia_nomaq,
                'diarioUltimaMilla': dia_um,
                'pctMaquinable': round((impo_maq / impo_m * 100), 1) if impo_m > 0 else 0,
                'pctNoMaquinable': round((impo_nomaq / impo_m * 100), 1) if impo_m > 0 else 0
            }

    # B) Transporte por Región
    for rnum in sorted(rows.keys()):
        if rnum >= tr_start:
            c = rows.get(rnum, {})
            linea = clean_str(c.get('D'))
            cod_planta = clean_str(c.get('B'))
            if linea and cod_planta and cod_planta.upper() not in ['COD', 'CODIGO', 'CODIGO DE PLANTA', 'REGION']:
                regional_transportes.append({
                    'region': clean_str(c.get('A')) or sname,
                    'codPlanta': cod_planta,
                    'tipoServicio': clean_str(c.get('C')),
                    'linea': linea,
                    'frecuencia': clean_str(c.get('E')),
                    'entrega': clean_str(c.get('F')),
                    'recibe': clean_str(c.get('G')),
                    'horarioLlegada': format_excel_time(c.get('H')),
                    'horarioSalida': format_excel_time(c.get('I')),
                    'tiempoOperacion': format_excel_time(c.get('J')),
                    'turno': clean_str(c.get('K')),
                    'tiempoRecorrido': format_excel_time(c.get('L')),
                    'distanciaKm': clean_str(c.get('M')),
                    'kmAcumulados': clean_str(c.get('N')),
                    'dependencia': clean_str(c.get('O')),
                    'provincia': clean_str(c.get('P')),
                    'capacidadBodega': clean_str(c.get('Q'))
                })

print(f"Extracted {len(regional_ingresos)} plantas with ingreso de envios")
print(f"Extracted {len(regional_transportes)} transport lines")

# =============================================================
# 4. PHOTOS MAPPING
# =============================================================
photo_map = {
    'C12': ['imagenes/sur/NEUQUEN_1.jpg', 'imagenes/sur/NEUQUEN_2.jpg', 'imagenes/sur/NEUQUEN_3.jpg', 'imagenes/sur/NEUQUEN_4.jpg', 'imagenes/sur/NEUQUEN_5.jpg', 'imagenes/sur/NEUQUEN_6.jpg'],
    'CRD': ['imagenes/sur/COMODORO_RIVADAVIA_1.jpg', 'imagenes/sur/COMODORO_RIVADAVIA_2.jpg', 'imagenes/sur/COMODORO_RIVADAVIA_3.jpg', 'imagenes/sur/COMODORO_RIVADAVIA_4.jpg', 'imagenes/sur/COMODORO_RIVADAVIA_5.jpg', 'imagenes/sur/COMODORO_RIVADAVIA_6.jpg'],
    'REL': ['imagenes/sur/TRELEW_1.jpg', 'imagenes/sur/TRELEW_2.jpg', 'imagenes/sur/TRELEW_3.jpg', 'imagenes/sur/TRELEW_4.jpg', 'imagenes/sur/TRELEW_5.jpg'],
    'C15': ['imagenes/sur/RIO_GALLEGOS_1.jpg', 'imagenes/sur/RIO_GALLEGOS_2.jpg', 'imagenes/sur/RIO_GALLEGOS_3.jpg', 'imagenes/sur/RIO_GALLEGOS_4.jpg'],
    'BRC': ['imagenes/sur/BARILOCHE_1.jpg', 'imagenes/sur/BARILOCHE_2.jpg', 'imagenes/sur/BARILOCHE_3.jpg', 'imagenes/sur/BARILOCHE_4.jpg'],
    'VAE': ['imagenes/placeholder.jpg'],
    'RGA': ['imagenes/placeholder.jpg'],
    'C14': ['imagenes/metro-pba/La Plata.jpg', 'imagenes/metro-pba/La Plata 1.jpg', 'imagenes/metro-pba/La Plata 2.jpg', 'imagenes/metro-pba/La Plata 3.jpg'],
    'CL4': ['imagenes/metro-pba/Bahia Blanca.jpg', 'imagenes/metro-pba/Bahia Blanca 1.jpg'],
    'CL3': ['imagenes/metro-pba/M del Plata.jpg', 'imagenes/metro-pba/M del Plata 1.jpg', 'imagenes/metro-pba/M del Plata 2.jpg'],
    'MER': ['imagenes/metro-pba/Mercedes.jpg', 'imagenes/metro-pba/Mercedes 1.jpg', 'imagenes/metro-pba/Mercedes 2.jpg'],
    'PER': ['imagenes/metro-pba/Pergamino.jpg', 'imagenes/metro-pba/Pergamino 1.jpg', 'imagenes/metro-pba/Pergamino 2.jpg'],
    'RSA': ['imagenes/metro-pba/Santa Rosa.jpg', 'imagenes/metro-pba/Santa Rosa 1.jpg', 'imagenes/metro-pba/Santa Rosa 3.jpg'],
    'DP2': ['imagenes/metro-pba/Barracas.jpg', 'imagenes/metro-pba/Barracas 1.jpg', 'imagenes/metro-pba/Barracas 2.jpg', 'imagenes/metro-pba/Barracas 3.jpg'],
    'DP3': ['imagenes/metro-pba/Quilmes .jpg', 'imagenes/metro-pba/Quilmes 1.jpg', 'imagenes/metro-pba/Quilmes 2.jpg', 'imagenes/metro-pba/Quilmes 3.jpg', 'imagenes/metro-pba/Quilmes 4.jpg'],
    'DP4': ['imagenes/metro-pba/Mercado Central.jpg', 'imagenes/metro-pba/Mercado central 1.jpg', 'imagenes/metro-pba/Mercado Central 2.jpg', 'imagenes/metro-pba/Mercado Central 3.jpg', 'imagenes/metro-pba/Mercado Central 4.jpg'],
    'DP5': ['imagenes/metro-pba/Moreno .jpg', 'imagenes/metro-pba/Moreno 1.jpg', 'imagenes/metro-pba/Moreno 2.jpg', 'imagenes/metro-pba/Moreno 3.jpg'],
    'DP6': ['imagenes/metro-pba/Vte. Lopez.jpg', 'imagenes/metro-pba/Vte. Lopez 1.jpg', 'imagenes/metro-pba/Vte. Lopez 2.jpg', 'imagenes/metro-pba/Vte. Lopez 3.jpg'],
    'CL6': ['imagenes/cuyo-noa/mendoza.jpg', 'imagenes/cuyo-noa/mendoza 1.jpg', 'imagenes/cuyo-noa/mendoza 2.jpg', 'imagenes/cuyo-noa/Mendoza 3.jpg'],
    'UAQ': ['imagenes/cuyo-noa/San Juan.jpg', 'imagenes/cuyo-noa/San juan 1.jpg', 'imagenes/cuyo-noa/San juan 2.jpg'],
    'LUQ': ['imagenes/cuyo-noa/San Luis.jpg', 'imagenes/cuyo-noa/San Luis 1.jpg', 'imagenes/cuyo-noa/San luis 2.jpg', 'imagenes/cuyo-noa/San luis 3.jpg'],
    'CTC': ['imagenes/cuyo-noa/Catamarca.jpg', 'imagenes/cuyo-noa/Catamarca 1.jpg', 'imagenes/cuyo-noa/Catamarca 2.jpg'],
    'CL8': ['imagenes/cuyo-noa/La Rioja.jpg', 'imagenes/cuyo-noa/La Rioja 1.jpg', 'imagenes/cuyo-noa/La Rioja 2.jpg'],
    'JUJ': ['imagenes/cuyo-noa/Jujuy.jpg', 'imagenes/cuyo-noa/Jujuy 1.jpg', 'imagenes/cuyo-noa/Jujuy 2.jpg'],
    'CL5': ['imagenes/cuyo-noa/Salta.jpg', 'imagenes/cuyo-noa/Salta 1.jpg', 'imagenes/cuyo-noa/Salta 2.jpg'],
    'C11': ['imagenes/cuyo-noa/Santiago del Estero.jpg', 'imagenes/cuyo-noa/Santiago del Estero 1.jpg', 'imagenes/cuyo-noa/Santiago del Estero 2.jpg'],
    'C10': ['imagenes/cuyo-noa/Tucuman.jpg', 'imagenes/cuyo-noa/Tucunan 1.jpg', 'imagenes/cuyo-noa/Tucuman 2.jpg'],
    'ROL': ['imagenes/centro-nea/Rosario Frente.jpg', 'imagenes/centro-nea/Rosario 1.jpg', 'imagenes/centro-nea/Rosario 2.jpg'],
    'CL9': ['imagenes/centro-nea/Santa Fe Frente 2.jpg', 'imagenes/centro-nea/Santa Fe 1.jpg', 'imagenes/centro-nea/Santa fe 2.jpg', 'imagenes/centro-nea/Santa Fe 3.jpg', 'imagenes/centro-nea/Santa Fe 4.jpg'],
    'C13': ['imagenes/centro-nea/Posadas Frente.jpg', 'imagenes/centro-nea/Posadas 1.jpg', 'imagenes/centro-nea/Posadas 2.jpg', 'imagenes/centro-nea/Posadas 3.jpg'],
    'NCQ': ['imagenes/centro-nea/Corrientes Frente.jpg', 'imagenes/centro-nea/Corrientes 1.jpg', 'imagenes/centro-nea/Corrientes 2.jpg', 'imagenes/centro-nea/Corrientes 3.jpg'],
    'CL7': ['imagenes/centro-nea/Cordoba frente.jpg', 'imagenes/centro-nea/Cordoba 1.jpg', 'imagenes/centro-nea/Cordoba 2.jpg'],
    'NIJ': ['imagenes/centro-nea/Parana Frente.jpg', 'imagenes/centro-nea/Parana 1.jpg', 'imagenes/centro-nea/Parana 2.jpg', 'imagenes/centro-nea/Parana frente nave 2.jpg'],
    'RPQ': ['imagenes/centro-nea/Resistencia frente.jpg', 'imagenes/centro-nea/Resistencia 1.jpg', 'imagenes/centro-nea/Resistencia 2.jpg', 'imagenes/centro-nea/Resistencia 3.jpg'],
    'VMR': ['imagenes/centro-nea/Villa Maria Frente.jpg', 'imagenes/centro-nea/Villa Maria 2.jpg', 'imagenes/centro-nea/Villa Maria 3.jpg', 'imagenes/centro-nea/Villa Maria 4.jpg'],
    'RCU': ['imagenes/centro-nea/Rio Cuarto Frente.jpg', 'imagenes/centro-nea/Rio Cuarto 1.jpg', 'imagenes/centro-nea/Rio cuarto 2.jpg', 'imagenes/centro-nea/Rio cuarto 3.jpg'],
}

# =============================================================
# 5. ASSEMBLE COMPLETE NODOS DATASET
# =============================================================
FORCE_CLOG_CODES = {'DP2', 'DP4', 'DP6', 'DP5', 'DP3', 'MER', 'VMR', 'RCU', 'UAQ'}

NAME_OVERRIDES = {
    'DP2': 'CLOG CABA SUR',
    'DP4': 'CLOG MERCADO CENTRAL',
    'DP6': 'CLOG VICENTE LOPEZ',
    'DP5': 'CLOG MORENO',
    'DP3': 'CLOG QUILMES',
    'MER': 'CLOG MERCEDES',
    'VMR': 'CLOG VILLA MARIA',
    'RCU': 'CLOG RIO CUARTO',
    'UAQ': 'CLOG SAN JUAN'
}

def get_tipo(cod, nombre):
    if cod in FORCE_CLOG_CODES:
        return 'CLOG'
    n = nombre.upper()
    if 'SORTER' in n or cod == 'DP4':
        return 'Sorter'
    if n.startswith('CLOG'):
        return 'CLOG'
    if n.startswith('CDP') or 'PAQUETERIA' in n:
        return 'CDP'
    if n.startswith('CTP') or n.startswith('CT '):
        return 'CTP'
    return 'CLOG'

def get_short_name(cod, uo):
    clean = re.sub(r'^(CLOG|CTP|CDP|CT|CENTRO PAQUETERIA|PAQUETERIA)\s+', '', uo, flags=re.I).strip()
    clean = ' '.join([w.capitalize() if len(w) > 2 else w for w in clean.split()])
    if clean.upper() == 'CABA SUR':
        return 'CABA Sur (Barracas)'
    if clean.upper() == 'COM. RIVADAVIA':
        return 'Comodoro Rivadavia'
    return clean

nodos_dataset = []

for row in plantas_rows:
    cod = clean_str(row.get('Cod de Planta'))
    if not cod: continue

    unidad = clean_str(row.get('Unidad operativa') or row.get('Unidad Operativa'))
    provincia = clean_str(row.get('Provincia'))
    ubicacion = clean_str(row.get('Ubicación') or row.get('Ubicacion'))
    domicilio = clean_str(row.get('Domicilio'))

    # Coordenadas
    coords_raw = clean_str(row.get('Coordenadas'))
    lat, lng = -34.6037, -58.3816
    if coords_raw and ',' in coords_raw:
        parts = coords_raw.split(',')
        try:
            lat = float(parts[0].strip())
            lng = float(parts[1].strip())
        except:
            pass

    # Tipo de Planta
    tipo = get_tipo(cod, unidad)

    # Región
    region = clean_str(row.get('Region'))
    reg_lower = region.lower()
    if 'sur' in reg_lower or 'patagonia' in reg_lower:
        regionKey = 'patagonia'
        regionNorm = 'Patagonia (Sur)'
    elif 'cuyo' in reg_lower or 'noa' in reg_lower:
        regionKey = 'cuyo'
        regionNorm = 'Cuyo / NOA'
    elif 'centro' in reg_lower or 'nea' in reg_lower:
        regionKey = 'centro'
        regionNorm = 'Centro / NEA'
    elif 'pba' in reg_lower or 'buenos aires' in reg_lower or 'pampa' in reg_lower:
        regionKey = 'pba'
        regionNorm = 'Provincia de Buenos Aires / La Pampa'
    elif 'metro' in reg_lower or 'amba' in reg_lower:
        regionKey = 'amba'
        regionNorm = 'Metropolitana (AMBA)'
    else:
        regionKey = 'nacional'
        regionNorm = region

    # Volúmenes exactos
    v_vta_raw = clean_str(row.get('Volumenes de Venta'))
    v_jur_raw = clean_str(row.get('Volumenes de Jurisdiccion'))
    v_vta_num = parse_num_clean(v_vta_raw)
    v_jur_num = parse_num_clean(v_jur_raw)
    vol_total_num = v_vta_num + v_jur_num

    m2_num = parse_num_clean(row.get('Metros Cuadrados'))

    dot_total = int(parse_num_clean(row.get('DOTACION TOTAL')) or 0)
    dot_aux = int(parse_num_clean(row.get('DOTACION AUXILIARES')) or 0)

    # Detalle de Turnos
    turnos = {
        'noche': {
            'franja': clean_str(row.get('FRANJA HORARIA TURNO NOCHE')),
            'jerarquico': clean_str(row.get('DOTACION JERARQUICO TURNO NOCHE') or '0'),
            'auxiliares': clean_str(row.get('DOTACION AUXILIARES TURNO NOCHE') or '0')
        },
        'manana': {
            'franja': clean_str(row.get('FRANJA HORARIA TURNO MAÑANA')),
            'jerarquico': clean_str(row.get('DOTACION JERARQUICO TURNO MAÑANA') or '0'),
            'auxiliares': clean_str(row.get('DOTACION AUXILIARES TURNO MAÑANA') or '0')
        },
        'tarde': {
            'franja': clean_str(row.get('FRANJA HORARIA TURNO TARDE')),
            'jerarquico': clean_str(row.get('DOTACION JERARQUICO TURNO TARDE') or '0'),
            'auxiliares': clean_str(row.get('DOTACION AUXILIARES TURNO TARDE') or '0')
        }
    }

    # Procesos
    procesos = {
        'cdp': clean_str(row.get('Proceso CDP')),
        'ctp': clean_str(row.get('Proceso CTP')),
        'ptaPta': clean_str(row.get('Proceso Pta Pta')),
        'clasificacion': clean_str(row.get('Proceso Clasificacion'))
    }

    # Responsables
    responsables = {
        'jefePlanta': clean_str(row.get('Jefe de Planta')),
        'jefeNodo': clean_str(row.get('Jefe de Nodo'))
    }

    # Inmueble y Costos
    inmueble = {
        'alquilada': clean_str(row.get('es alquilada')),
        'almacenamiento': clean_str(row.get('TIPO')),
        'planos': clean_str(row.get('PLANOS')),
        'gastoVigilancia': parse_num_clean(row.get('gasto vigilancia')),
        'gastoLimpieza': parse_num_clean(row.get('gasto limpieza')),
        'gastoOperativo': parse_num_clean(row.get('gasto operativo')),
        'seguridadObservaciones': clean_str(row.get('MEDIDAS DE SEGURIDAD / OBSERVACIONES'))
    }

    # Optimización y Dotación necesaria (de Sheet 6)
    opt = plantas_optimizacion.get(cod, {})

    # Ingreso de envíos detallado (de Sheets 2-5)
    ing = regional_ingresos.get(cod, {})

    # Transportes asignados a esta planta
    tr_planta = [t for t in regional_transportes if t['codPlanta'].upper() == cod.upper()]

    nombre_limpio = get_short_name(cod, unidad)
    nombre_completo = NAME_OVERRIDES.get(cod, unidad)

    nodo = {
        'id': cod.lower(),
        'cod': cod,
        'nombre': nombre_limpio,
        'nombreCompleto': nombre_completo,
        'tipo': tipo,
        'provincia': provincia,
        'ubicacion': ubicacion,
        'domicilio': domicilio,
        'region': regionNorm,
        'regionKey': regionKey,
        'lat': lat,
        'lng': lng,
        'capacidad': f"{int(m2_num):,} m²".replace(",", "."),
        'capacidadM2': m2_num,
        'piezasDia': f"{int(vol_total_num):,}".replace(",", "."),
        'volumenVenta': v_vta_raw,
        'volumenVentaNum': v_vta_num,
        'volumenJurisdiccion': v_jur_raw,
        'volumenJurisdiccionNum': v_jur_num,
        'volumenTotalNum': vol_total_num,
        'dotacionTotal': dot_total,
        'dotacionAuxiliares': dot_aux,
        'turnos': turnos,
        'procesos': procesos,
        'responsables': responsables,
        'inmueble': inmueble,
        'optimizacion': opt,
        'ingresoEnvios': ing,
        'transportes': tr_planta,
        'fotos': photo_map.get(cod, ['imagenes/placeholder.jpg']),
        'desc': f"Planta logística oficial de Correo Argentino en {provincia}. Ubicada en {domicilio}. Capacidad operativa de {int(m2_num):,} m² y volumen diario de {int(vol_total_num):,} envíos."
    }
    nodos_dataset.append(nodo)

print(f"Total nodos ensamblados: {len(nodos_dataset)}")

# Validación de totales
tot_vta = sum(n['volumenVentaNum'] for n in nodos_dataset)
tot_jur = sum(n['volumenJurisdiccionNum'] for n in nodos_dataset)
tot_vol = sum(n['volumenTotalNum'] for n in nodos_dataset)
tot_dot = sum(n['dotacionTotal'] for n in nodos_dataset)
tot_aux = sum(n['dotacionAuxiliares'] for n in nodos_dataset)
tot_m2 = sum(n['capacidadM2'] for n in nodos_dataset)
types_count = {}
for n in nodos_dataset:
    types_count[n['tipo']] = types_count.get(n['tipo'], 0) + 1

print("\n--- VALIDACIÓN TOTALES NACIONALES (SHEET 1 + SHEETS 2-6) ---")
print(f"Total Plantas: {len(nodos_dataset)} -> {types_count}")
print(f"Total Volumen Venta: {tot_vta:,.1f}")
print(f"Total Volumen Jurisdicción: {tot_jur:,.1f}")
print(f"Total Volumen Diario: {tot_vol:,.1f}")
print(f"Total Dotación: {tot_dot}")
print(f"Total Auxiliares: {tot_aux}")
print(f"Total Superficie: {tot_m2:,.0f} m²")

# Export to JSON
with open('data/nodos_dataset.json', 'w', encoding='utf-8') as f:
    json.dump(nodos_dataset, f, ensure_ascii=False, indent=2)

# Export to JS files
full_js_content = f"""// =============================================================
// CORREO ARGENTINO — DATASET OFICIAL DE PLANTAS LOGÍSTICAS
// Extracción COMPLETA de: data/Analisis plantas Logisticas act..xlsx
// Incluye:
// - 36 Plantas con coordenadas, turnos, procesos, jefaturas (Sheet 'plantas')
// - Detalle Ingreso de Envíos Maquinables vs No Maquinables (Sheets SUR, CUYO NOA, CENTRO NEA, PBA)
// - Dotación Óptima y Personal a Reubicar (Sheets SUR, CUYO NOA, CENTRO NEA, PBA y Resumen)
// - Detalle Transporte por Región (310 líneas de servicio)
// - Resumen Ejecutivo con costos de empresa mensuales y anuales (Sheet 'Resumen')
// =============================================================

const NODOS_DATA_OFICIAL = {json.dumps(nodos_dataset, ensure_ascii=False, indent=2)};

const RESUMEN_EJECUTIVO_OFICIAL = {{
  regiones: {json.dumps(resumen_ejecutivo, ensure_ascii=False, indent=2)},
  nacional: {json.dumps(resumen_nacional, ensure_ascii=False, indent=2)}
}};

const TRANSPORTE_RED_OFICIAL = {json.dumps(regional_transportes, ensure_ascii=False, indent=2)};

if (typeof module !== "undefined" && module.exports) {{
  module.exports = {{
    NODOS_DATA_OFICIAL,
    RESUMEN_EJECUTIVO_OFICIAL,
    TRANSPORTE_RED_OFICIAL
  }};
}}
"""

with open('data/nodos-data.js', 'w', encoding='utf-8') as f:
    f.write(full_js_content)

with open('nodos-data.js', 'w', encoding='utf-8') as f:
    f.write(full_js_content)

print("\nSuccessfully updated data/nodos_dataset.json, data/nodos-data.js, and nodos-data.js!")
