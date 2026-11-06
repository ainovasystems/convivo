import type { Province } from "@/lib/listings/options";

/**
 * Municipios conocidos → provincia. No son los 8.000 municipios de España:
 * están todas las capitales de provincia, las ciudades con universidad y los
 * municipios grandes, que es donde se concentra el alquiler compartido.
 * Si la ciudad está aquí, la provincia se fija sola y no se puede cambiar;
 * si no, el usuario elige la provincia a mano.
 *
 * Formato: [nombre oficial, provincia, ...otros nombres con los que se busca].
 */
const CITY_DATA: ReadonlyArray<readonly [string, Province, ...string[]]> = [
  // Galicia
  ["A Coruña", "A Coruña", "La Coruña", "Coruña"],
  ["Santiago de Compostela", "A Coruña", "Santiago"],
  ["Ferrol", "A Coruña"],
  ["Narón", "A Coruña"],
  ["Oleiros", "A Coruña"],
  ["Arteixo", "A Coruña"],
  ["Culleredo", "A Coruña"],
  ["Ames", "A Coruña"],
  ["Carballo", "A Coruña"],
  ["Lugo", "Lugo"],
  ["Monforte de Lemos", "Lugo"],
  ["Viveiro", "Lugo"],
  ["Ourense", "Ourense", "Orense"],
  ["Pontevedra", "Pontevedra"],
  ["Vigo", "Pontevedra"],
  ["Vilagarcía de Arousa", "Pontevedra", "Villagarcía de Arosa"],
  ["Redondela", "Pontevedra"],
  ["Cangas", "Pontevedra"],
  ["Marín", "Pontevedra"],
  ["Sanxenxo", "Pontevedra", "Sangenjo"],
  // Asturias, Cantabria, País Vasco, Navarra, La Rioja
  ["Oviedo", "Asturias", "Uviéu"],
  ["Gijón", "Asturias", "Xixón"],
  ["Avilés", "Asturias"],
  ["Mieres", "Asturias"],
  ["Langreo", "Asturias"],
  ["Siero", "Asturias"],
  ["Santander", "Cantabria"],
  ["Torrelavega", "Cantabria"],
  ["Bilbao", "Bizkaia", "Bilbo"],
  ["Barakaldo", "Bizkaia", "Baracaldo"],
  ["Getxo", "Bizkaia", "Guecho"],
  ["Leioa", "Bizkaia", "Lejona"],
  ["Portugalete", "Bizkaia"],
  ["Basauri", "Bizkaia"],
  ["Vitoria-Gasteiz", "Álava", "Vitoria", "Gasteiz"],
  ["Donostia-San Sebastián", "Gipuzkoa", "San Sebastián", "Donostia"],
  ["Irun", "Gipuzkoa", "Irún"],
  ["Eibar", "Gipuzkoa"],
  ["Arrasate-Mondragón", "Gipuzkoa", "Mondragón", "Arrasate"],
  ["Pamplona", "Navarra", "Iruña", "Pamplona-Iruña"],
  ["Tudela", "Navarra"],
  ["Logroño", "La Rioja"],
  // Castilla y León
  ["León", "León"],
  ["Ponferrada", "León"],
  ["San Andrés del Rabanedo", "León"],
  ["Burgos", "Burgos"],
  ["Miranda de Ebro", "Burgos"],
  ["Aranda de Duero", "Burgos"],
  ["Palencia", "Palencia"],
  ["Valladolid", "Valladolid"],
  ["Laguna de Duero", "Valladolid"],
  ["Zamora", "Zamora"],
  ["Salamanca", "Salamanca"],
  ["Ávila", "Ávila"],
  ["Segovia", "Segovia"],
  ["Soria", "Soria"],
  // Madrid
  ["Madrid", "Madrid"],
  ["Alcalá de Henares", "Madrid"],
  ["Getafe", "Madrid"],
  ["Leganés", "Madrid"],
  ["Móstoles", "Madrid"],
  ["Fuenlabrada", "Madrid"],
  ["Alcorcón", "Madrid"],
  ["Alcobendas", "Madrid"],
  ["San Sebastián de los Reyes", "Madrid"],
  ["Pozuelo de Alarcón", "Madrid"],
  ["Majadahonda", "Madrid"],
  ["Las Rozas de Madrid", "Madrid", "Las Rozas"],
  ["Boadilla del Monte", "Madrid"],
  ["Villaviciosa de Odón", "Madrid"],
  ["Torrejón de Ardoz", "Madrid"],
  ["Coslada", "Madrid"],
  ["Rivas-Vaciamadrid", "Madrid", "Rivas"],
  ["Parla", "Madrid"],
  ["Collado Villalba", "Madrid"],
  ["Aranjuez", "Madrid"],
  ["Colmenar Viejo", "Madrid"],
  ["Tres Cantos", "Madrid"],
  // Castilla-La Mancha
  ["Toledo", "Toledo"],
  ["Talavera de la Reina", "Toledo"],
  ["Ciudad Real", "Ciudad Real"],
  ["Puertollano", "Ciudad Real"],
  ["Albacete", "Albacete"],
  ["Cuenca", "Cuenca"],
  ["Guadalajara", "Guadalajara"],
  // Extremadura
  ["Badajoz", "Badajoz"],
  ["Mérida", "Badajoz"],
  ["Cáceres", "Cáceres"],
  ["Plasencia", "Cáceres"],
  // Cataluña
  ["Barcelona", "Barcelona"],
  ["L'Hospitalet de Llobregat", "Barcelona", "Hospitalet de Llobregat", "L'Hospitalet", "Hospitalet"],
  ["Badalona", "Barcelona"],
  ["Terrassa", "Barcelona", "Tarrasa"],
  ["Sabadell", "Barcelona"],
  ["Mataró", "Barcelona"],
  ["Santa Coloma de Gramenet", "Barcelona"],
  ["Cornellà de Llobregat", "Barcelona", "Cornellá de Llobregat", "Cornellà"],
  ["Sant Cugat del Vallès", "Barcelona", "Sant Cugat"],
  ["Cerdanyola del Vallès", "Barcelona", "Cerdanyola"],
  ["Bellaterra", "Barcelona"],
  ["Granollers", "Barcelona"],
  ["Manresa", "Barcelona"],
  ["Vic", "Barcelona"],
  ["Castelldefels", "Barcelona"],
  ["Sant Boi de Llobregat", "Barcelona"],
  ["Rubí", "Barcelona"],
  ["Vilanova i la Geltrú", "Barcelona"],
  ["Girona", "Girona", "Gerona"],
  ["Figueres", "Girona", "Figueras"],
  ["Lleida", "Lleida", "Lérida"],
  ["Tarragona", "Tarragona"],
  ["Reus", "Tarragona"],
  ["Tortosa", "Tarragona"],
  // Aragón
  ["Zaragoza", "Zaragoza"],
  ["Huesca", "Huesca"],
  ["Teruel", "Teruel"],
  // Comunitat Valenciana
  ["Valencia", "Valencia", "València"],
  ["Burjassot", "Valencia", "Burjasot"],
  ["Paterna", "Valencia"],
  ["Torrent", "Valencia", "Torrente"],
  ["Gandia", "Valencia", "Gandía"],
  ["Sagunto", "Valencia", "Sagunt"],
  ["Alicante", "Alicante", "Alacant"],
  ["San Vicente del Raspeig", "Alicante", "Sant Vicent del Raspeig"],
  ["Elche", "Alicante", "Elx"],
  ["Alcoy", "Alicante", "Alcoi"],
  ["Benidorm", "Alicante"],
  ["Torrevieja", "Alicante"],
  ["Orihuela", "Alicante"],
  ["Castellón de la Plana", "Castellón", "Castellón", "Castelló", "Castelló de la Plana"],
  ["Vila-real", "Castellón", "Villarreal"],
  // Murcia
  ["Murcia", "Murcia"],
  ["Cartagena", "Murcia"],
  ["Lorca", "Murcia"],
  ["Molina de Segura", "Murcia"],
  // Andalucía
  ["Sevilla", "Sevilla"],
  ["Dos Hermanas", "Sevilla"],
  ["Alcalá de Guadaíra", "Sevilla"],
  ["Córdoba", "Córdoba"],
  ["Granada", "Granada"],
  ["Motril", "Granada"],
  ["Málaga", "Málaga"],
  ["Marbella", "Málaga"],
  ["Fuengirola", "Málaga"],
  ["Torremolinos", "Málaga"],
  ["Vélez-Málaga", "Málaga"],
  ["Benalmádena", "Málaga"],
  ["Cádiz", "Cádiz"],
  ["Jerez de la Frontera", "Cádiz", "Jerez"],
  ["Algeciras", "Cádiz"],
  ["Puerto Real", "Cádiz"],
  ["El Puerto de Santa María", "Cádiz", "Puerto de Santa María"],
  ["San Fernando", "Cádiz"],
  ["Huelva", "Huelva"],
  ["Jaén", "Jaén"],
  ["Linares", "Jaén"],
  ["Almería", "Almería"],
  ["El Ejido", "Almería"],
  ["Roquetas de Mar", "Almería"],
  // Baleares y Canarias
  ["Palma", "Illes Balears", "Palma de Mallorca"],
  ["Ibiza", "Illes Balears", "Eivissa"],
  ["Manacor", "Illes Balears"],
  ["Las Palmas de Gran Canaria", "Las Palmas", "Las Palmas"],
  ["Telde", "Las Palmas"],
  ["Arrecife", "Las Palmas"],
  ["Santa Cruz de Tenerife", "Santa Cruz de Tenerife"],
  ["San Cristóbal de La Laguna", "Santa Cruz de Tenerife", "La Laguna"],
  ["Arona", "Santa Cruz de Tenerife"],
  // Ciudades autónomas
  ["Ceuta", "Ceuta"],
  ["Melilla", "Melilla"],
];

/** Minúsculas, sin tildes ni signos: "L'Hospitalet" ≈ "lhospitalet", "Lérida" ≈ "lerida". */
export function normalizeCity(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

type City = { name: string; province: Province };

const INDEX = new Map<string, City>();
for (const [name, province, ...aliases] of CITY_DATA) {
  for (const key of [name, ...aliases]) INDEX.set(normalizeCity(key), { name, province });
}

/** Nombres oficiales, sin repetir y ordenados (para sugerir en el campo Ciudad). */
export const KNOWN_CITY_NAMES = [...new Set(CITY_DATA.map(([name]) => name))].sort((a, b) => a.localeCompare(b, "es"));

/** Ciudad conocida (con su nombre oficial y provincia) o null si no está en la lista. */
export function findCity(input: string | null | undefined): City | null {
  if (!input) return null;
  return INDEX.get(normalizeCity(input)) ?? null;
}
