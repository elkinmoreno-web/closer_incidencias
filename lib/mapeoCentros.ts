/**
 * Traducción del nombre de centro tal como viene en el Excel de RRHH
 * (izquierda, "Centro Antiguo") al nombre del centro tal como existe en
 * nuestra base de datos (derecha, en MAYÚSCULAS igual que el catálogo).
 *
 * Motivo: el Excel usa nombres tipo "FD Jerez", pero en el sistema los
 * centros se llaman "JEREZ CENTRO", etc. Sin esta traducción, la
 * importación no encontraría el centro y el rider quedaría sin asignar.
 *
 * La clave se compara normalizada (minúsculas, sin tildes, sin espacios
 * de más), así que da igual cómo venga escrito exactamente.
 *
 * Si en el Excel aparece un centro que NO está aquí, el rider se importa
 * SIN centro y se avisa en el resumen. Nunca se crean centros nuevos.
 *
 * Los centros que empiezan por "MCD" en el Excel NO se importan (se
 * filtran antes, en xlsxImport.ts): son de otra operación, no riders.
 */
export const MAPEO_CENTROS: Record<string, string> = {
  'fd albacete': 'ALBACETE',
  'fd alicante centro': 'ALICANTE CENTRO',
  'fd alicante raspeig': 'ALICANTE RASPEIG',
  'fd alicante sant joan': 'ALICANTE SANT JOAN',
  'fd almeria centro': 'ALMERIA CENTRO',
  'fd almeria roquetas': 'ALMERIA ROQUETAS',
  'fd aviles centro': 'AVILES',
  'fd badajoz': 'BADAJOZ',
  'fd barcelona badalona': 'BARCELONA BADALONA',
  'fd barcelona castelldefels': 'BARCELONA CASTELLDEFELS',
  'fd barcelona centro': 'BARCELONA CENTRO',
  'fd barcelona cerdanyola ripollet': 'BARCELONA CERDANYOLA RIPOLLET',
  'fd barcelona gava viladecans': 'BARCELONA GAVA VILADECANS',
  'fd barcelona granollers': 'BARCELONA GRANOLLERS',
  'fd barcelona llobregat': 'BARCELONA LLOBREGAT',
  'fd barcelona martorell': 'BARCELONA MARTORELL',
  'fd barcelona mataro': 'BARCELONA MATARO',
  'fd barcelona parets': 'BARCELONA PARETS',
  'fd barcelona sabadell barbera': 'BARCELONA SABADELL',
  'fd barcelona sant cugat': 'BARCELONA SANT CUGAT',
  'fd barcelona terrassa': 'BARCELONA TERRASSA',
  'fd bilbao': 'BILBAO',
  'fd bilbao norte': 'BILBAO NORTE',
  'fd burgos': 'BURGOS',
  'fd caceres': 'CACERES',
  'fd cadiz algeciras': 'ALGECIRAS',
  'fd cadiz la linea': 'ALGECIRAS LA LINEA',
  'fd castellon centro': 'CASTELLON DE LA PLANA',
  'fd castellon villarreal': 'CASTELLON VILLARREAL',
  'fd ciudad real': 'CIUDAD REAL',
  'fd collado villalba': 'MADRID COLLADO VILLALBA',
  'fd cordoba': 'CORDOBA',
  'fd elche centro': 'ALICANTE ELCHE',
  'fd gandia': 'GANDIA',
  'fd gijon': 'GIJON',
  'fd girona': 'GIRONA',
  'fd granada': 'GRANADA CENTRO',
  'fd huelva': 'HUELVA',
  'fd ibiza': 'IBIZA',
  'fd jaen': 'JAEN',
  'fd jerez': 'JEREZ CENTRO',
  'fd jerez cadiz': 'JEREZ CADIZ',
  'fd jerez chiclana': 'JEREZ CHICLANA DE LA FRONTERA',
  'fd jerez puerto': 'JEREZ PUERTO DE SANTA MARIA',
  'fd jerez rota': 'JEREZ ROTA',
  'fd jerez san fernando': 'JEREZ SAN FERNANDO',
  'fd la coruña': 'LA CORUNA CENTRO',
  'fd la coruña ferrol': 'LA CORUNA FERROL',
  'fd la coruña santiago': 'SANTIAGO DE COMPOSTELA',
  'fd leon': 'LEON',
  'fd lleida': 'LLEIDA',
  'fd logroño centro': 'LOGRONO',
  'fd lugo': 'LUGO',
  'fd madrid alcala de henares': 'MADRID ALCALA DE HENARES',
  'fd madrid alcobendas': 'MADRID ALCOBENDAS',
  'fd madrid alcorcon - mostoles': 'MADRID ALCORCÓN',
  'fd madrid barajas': 'MADRID BARAJAS',
  'fd madrid carabanchel': 'MADRID CARABANCHEL',
  'fd madrid centro': 'MADRID CENTRO',
  'fd madrid coslada': 'MADRID COSLADA',
  'fd madrid getafe': 'MADRID GETAFE',
  'fd madrid las rozas': 'MADRID LAS ROZAS',
  'fd madrid majadahonda': 'MADRID MAJADAHONDA',
  'fd madrid mirasierra': 'MADRID MIRASIERRA',
  'fd madrid parla fuenlabrada': 'MADRID PARLA FUENLABRADA',
  'fd madrid pozuelo': 'MADRID POZUELO',
  'fd madrid rivas': 'MADRID RIVAS',
  'fd madrid torrejon': 'MADRID TORREJON',
  'fd madrid vallecas': 'MADRID VALLECAS',
  'fd malaga centro': 'MALAGA CENTRO',
  'fd malaga fuengirola': 'MALAGA FUENGIROLA',
  'fd malaga marbella': 'MALAGA MARBELLA',
  'fd malaga mijas': 'MALAGA MIJAS',
  'fd malaga torremolinos': 'MALAGA TORREMOLINOS',
  'fd mallorca': 'MALLORCA CENTRO',
  'fd melilla': 'MELILLA',
  'fd murcia cartagena': 'MURCIA CARTAGENA',
  'fd murcia centro': 'MURCIA CENTRO',
  'fd ourense': 'OURENSE',
  'fd oviedo': 'OVIEDO',
  'fd pamplona': 'PAMPLONA',
  'fd pinto valdemoro': 'MADRID PINTO VALDEMORO',
  'fd pontevedra': 'PONTEVEDRA',
  'fd salamanca': 'SALAMANCA',
  'fd san sebastian': 'SAN SEBASTIAN',
  'fd santander': 'SANTANDER',
  'fd segovia': 'SEGOVIA',
  'fd sevilla centro': 'SEVILLA CENTRO',
  'fd sevilla dos hermanas': 'SEVILLA DOS HERMANAS',
  'fd sevilla este': 'SEVILLA ESTE',
  'fd sevilla montequinto': 'SEVILLA MONTEQUINTO',
  'fd sevilla oeste': 'SEVILLA OESTE',
  'fd tarragona': 'TARRAGONA',
  'fd toledo centro': 'TOLEDO',
  'fd valencia alfafar picassent': 'VALENCIA ALFAFAR PICASSENT',
  'fd valencia centro': 'VALENCIA CENTRO',
  'fd valencia paterna': 'VALENCIA PATERNA',
  'fd valencia sagunto': 'VALENCIA SAGUNTO',
  'fd valencia torrente bonaire': 'VALENCIA TORRENTE BONAIRE',
  'fd valladolid': 'VALLADOLID',
  'fd vigo': 'VIGO',
  'fd vitoria': 'VITORIA',
  'fd zamora': 'ZAMORA',
  'fd zaragoza': 'ZARAGOZA',
};

/** Normaliza un nombre para comparar sin importar tildes/mayúsculas/espacios. */
export function normalizarNombreCentro(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Devuelve el nombre "oficial" (el de nuestra base de datos) para un
 * nombre de centro que viene del Excel. Si no está en el mapeo, devuelve
 * null (el rider se importará sin centro).
 */
export function nombreCentroOficial(nombreExcel: string): string | null {
  const key = normalizarNombreCentro(nombreExcel);
  return MAPEO_CENTROS[key] ?? null;
}
