/**
 * Traducción del nombre de centro tal como viene en el Excel de RRHH
 * (izquierda) al nombre del centro tal como existe en nuestra base de
 * datos (derecha).
 *
 * Motivo: el Excel usa nombres tipo "FD Jerez" o "MCD Oliva", pero en el
 * sistema los centros se llaman "Jerez Centro", "Gandia", etc. Sin esta
 * traducción, la importación no encontraría el centro y el rider
 * quedaría sin asignar (o se crearían centros duplicados).
 *
 * La clave se compara normalizada (minúsculas, sin tildes, sin espacios
 * de más), así que da igual cómo venga escrito exactamente.
 *
 * Si en el Excel aparece un centro que NO está aquí, el rider se importa
 * SIN centro y se avisa en el resumen de la importación. No se crean
 * centros nuevos automáticamente.
 */
export const MAPEO_CENTROS: Record<string, string> = {
  'centro fd': 'FD SEGUIMIENTO',
  'fd albacete': 'Albacete',
  'fd sevilla centro': 'Sevilla Centro',
  'fd toledo centro': 'Toledo',
  'fd madrid centro': 'Madrid Centro',
  'fd barcelona centro': 'Barcelona Centro',
  'fd valencia centro': 'Valencia Centro',
  'fd murcia centro': 'Murcia',
  'fd zaragoza': 'Zaragoza',
  'fd mallorca': 'Mallorca',
  'fd jaen': 'Jaen',
  'mcd oliva': 'Gandia',
  'fd salamanca': 'Salamanca',
  'fd alicante centro': 'Alicante Centro',
  'fd logroño centro': 'Logrono',
  'fd la coruña': 'La Coruna Centro',
  'fd malaga centro': 'Malaga Centro',
  'fd cordoba': 'Cordoba',
  'fd jerez cadiz': 'Jerez Cadiz',
  'fd leon': 'Leon',
  'fd valladolid': 'Valladolid',
  'fd lleida': 'Lleida',
  'fd gijon': 'Gijon',
  'fd granada': 'Granada',
  'mcd san jose de la rinconada': 'Sevilla Centro',
  'fd cadiz algeciras': 'Algeciras',
  'fd almeria centro': 'Almeria',
  'fd lugo': 'Lugo',
  'fd bilbao': 'Bilbao',
  'mcd valdemoro': 'Madrid Centro',
  'fd huelva': 'Huelva',
  'fd pamplona': 'Pamplona',
  'fd valdepeñas': 'Valdepenas',
  'fd jerez san fernando': 'Jerez San Fernando',
  'fd jerez': 'Jerez Centro',
  'fd gandia': 'Gandia',
  'fd zamora': 'Zamora',
  'fd soria': 'Soria',
  'mcd burriana': 'Castellon',
  'fd pontevedra': 'Pontevedra',
  'fd segovia': 'Segovia',
  'fd elche centro': 'Alicante Elche',
  'fd jerez rota': 'Jerez Rota',
  'mcd lucena': 'Lucena',
  'fd jaen linares': 'Linares',
  'fd aviles centro': 'Aviles',
  'fd girona': 'Girona',
  'fd castellon centro': 'Castellon',
  'fd ibiza': 'Ibiza',
  'fd ourense': 'Ourense',
  'mcd soria': 'Soria',
  'mcd pilar de la horadada': 'Murcia',
  'fd ciudad real': 'Ciudad Real',
  'fd san sebastian': 'San Sebastian',
  'fd jerez puerto': 'Jerez Puerto de Santa Maria',
  'fd melilla': 'Melilla',
  'mcd pamplona valle de egües': 'Pamplona',
  'fd ceuta': 'Ceuta',
  'fd jerez chiclana': 'Jerez Chiclana de la Frontera',
  'fd vinaroz': 'Vinaros',
  'fd cuenca': 'Cuenca, Spain',
  'fd merida': 'Merida',
  'fd huesca': 'Huesca',
  'mcd yecla': 'Yecla',
  'fd ubeda': 'Ubeda',
  'mcd utrera': 'Sevilla Centro',
  'fd madrid alcorcon - mostoles': 'Madrid Alcorcón',
  'fd madrid getafe': 'Madrid Getafe',
  'fd madrid alcobendas': 'Madrid Alcobendas',
  'fd valencia paterna': 'Valencia Paterna',
  'fd sevilla oeste': 'Sevilla Oeste',
  'fd la coruña ferrol': 'La Coruna Ferrol',
  'fd la coruña santiago': 'La Coruna Santiago',
  'fd badajoz': 'Badajoz',
  'fd burgos': 'Burgos',
  'fd santander': 'Santander',
  'fd tarragona': 'Tarragona',
  'mcd banyoles': 'Madrid Centro',
  'fd avila': 'Avila',
  'fd motril': 'Motril',
  'fd vitoria': 'Vitoria',
  'fd caceres': 'Caceres',
  'fd barcelona llobregat': 'Barcelona Llobregat',
  'fd barcelona sabadell barbera': 'Barcelona Sabadell',
  'fd alicante sant joan': 'Alicante Sant Joan',
  'fd malaga san pedro': 'Malaga San Pedro',
  'food delivery murcia (lorca)': 'Lorca',
  'fd vigo': 'Pontevedra Vigo',
  'fd malaga fuengirola': 'Malaga Fuengirola',
  'fd barcelona terrassa': 'Barcelona Terrassa',
  'fd barcelona gava viladecans': 'Barcelona Gava Viladecans',
  'fd sevilla montequinto': 'Sevilla Montequinto',
  'fd sevilla dos hermanas': 'Sevilla Dos Hermanas',
  'fd bilbao norte': 'Bilbao Norte',
  'mcd pinto': 'Madrid Getafe',
  'fd barcelona badalona': 'Barcelona Badalona',
  'fd cadiz la linea': 'Algeciras La Linea',
  'fd pinto valdemoro': 'Madrid Pinto Valdemoro',
  'fd barcelona sant cugat': 'Barcelona Sant Cugat',
  'fd alicante raspeig': 'Alicante Raspeig',
  'fd almeria roquetas': 'Almeria Roquetas',
  'fd barcelona castelldefels': 'Barcelona Castelldefels',
  'fd barcelona cerdanyola ripollet': 'Barcelona Cerdanyola Ripollet',
  'fd barcelona granollers': 'Barcelona Granollers',
  'fd barcelona parets': 'Barcelona Parets',
  'fd madrid alcala de henares': 'Madrid Alcala De Henares',
  'fd madrid barajas': 'Madrid Barajas',
  'fd madrid carabanchel': 'Madrid Carabanchel',
  'fd madrid coslada': 'Madrid Coslada',
  'fd madrid majadahonda': 'Madrid Majadahonda',
  'fd madrid parla fuenlabrada': 'Madrid Parla Fuenlabrada',
  'fd madrid pozuelo': 'Madrid Pozuelo',
  'fd madrid rivas': 'Madrid Rivas',
  'fd madrid torrejon': 'Madrid Torrejon',
  'fd madrid vallecas': 'Madrid Vallecas',
  'fd malaga torremolinos': 'Malaga Torremolinos',
  'fd oviedo': 'Oviedo',
  'fd valencia sagunto': 'Valencia Sagunto',
  'fd valencia torrente bonaire': 'Valencia Torrente Bonaire',
  'mcd sant boi': 'Barcelona Llobregat',
  'fd murcia cartagena': 'Murcia Cartagena',
  'fd sevilla este': 'Sevilla Este',
  'fd valencia alfafar picassent': 'Valencia Alfafar Picassent',
  'fd madrid boadilla': 'Madrid Boadilla',
  'fd collado villalba': 'Madrid Collado Villalba',
  'fd madrid mirasierra': 'Madrid Mirasierra',
  'fd madrid las rozas': 'Madrid Las Rozas',
  'fd malaga marbella': 'Malaga Marbella',
  'fd malaga mijas': 'Malaga Mijas',
  'fd barcelona martorell': 'Barcelona Martorell',
  'fd barcelona mataro': 'Barcelona Mataro',
  'fd barcelona sant vicenc': 'Barcelona Sant Vicenc',
  'fd castellon villarreal': 'Castellon Villarreal',
  'fd mallorca arenal': 'Mallorca Arenal',
  'fd mallorca magaluf': 'Mallorca Magaluf',
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
