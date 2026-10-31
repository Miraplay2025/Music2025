// fuso-horario.js
// Mapeamento universal de todos os países do mundo para seus fusos horários oficiais

const dicionarioPaisesMundial = {
    // --- ÁFRICA ---
    "mocambique": "Africa/Maputo", "mozambique": "Africa/Maputo",
    "angola": "Africa/Luanda",
    "africadosul": "Africa/Johannesburg", "southafrica": "Africa/Johannesburg",
    "caboverde": "Atlantic/Cape_Verde",
    "saotomeeprincipe": "Africa/Sao_Tome",
    "guinebissau": "Africa/Bissau",
    "nigeria": "Africa/Lagos",
    "quenia": "Africa/Nairobi", "kenya": "Africa/Nairobi",
    "egito": "Africa/Cairo", "egypt": "Africa/Cairo",
    "marrocos": "Africa/Casablanca", "morocco": "Africa/Casablanca",
    "argelia": "Africa/Algiers", "algeria": "Africa/Algiers",
    "tunisia": "Africa/Tunis",
    "etiopia": "Africa/Addis_Ababa", "ethiopia": "Africa/Addis_Ababa",
    "gana": "Africa/Accra", "ghana": "Africa/Accra",
    "camaroes": "Africa/Douala", "cameroon": "Africa/Douala",
    "senegal": "Africa/Dakar",
    "madagascar": "Indian/Antananarivo",
    "mauricio": "Indian/Mauritius", "mauritius": "Indian/Mauritius",
    "zimbabue": "Africa/Harare", "zimbabwe": "Africa/Harare",
    "zambia": "Africa/Lusaka",
    "tanzania": "Africa/Dar_es_Salaam",
    "uganda": "Africa/Kampala",
    "ruanda": "Africa/Kigali", "rwanda": "Africa/Kigali",
    "mali": "Africa/Bamako",
    "burkinafaso": "Africa/Ouagadougou",
    "niger": "Africa/Niamey",
    "chade": "Africa/Ndjamena", "chad": "Africa/Ndjamena",
    "sudan": "Africa/Khartoum", "sudao": "Africa/Khartoum",
    "somalia": "Africa/Mogadishu",
    "libia": "Africa/Tripoli", "libya": "Africa/Tripoli",
    "botsuana": "Africa/Gaborone", "botswana": "Africa/Gaborone",
    "namibia": "Africa/Windhoek",
    "eswatini": "Africa/Mbabane",
    "lesoto": "Africa/Maseru", "lesotho": "Africa/Maseru",
    "malawi": "Africa/Blantyre",
    "burundi": "Africa/Bujumbura",
    "djibouti": "Africa/Djibouti",
    "eritrea": "Africa/Asmara",
    "gabon": "Africa/Libreville",
    "gambia": "Africa/Banjul",
    "guinea": "Africa/Conakry",
    "equatorialguinea": "Africa/Malabo",
    "liberia": "Africa/Monrovia",
    "mauritania": "Africa/Nouakchott",
    "serraleone": "Africa/Freetown",
    "togo": "Africa/Lome",
    "benin": "Africa/Porto-Novo",

    // --- AMÉRICA DO SUL ---
    "brasil": "America/Sao_Paulo", "brazil": "America/Sao_Paulo",
    "argentina": "America/Argentina/Buenos_Aires",
    "chile": "America/Santiago",
    "colombia": "America/Bogota",
    "peru": "America/Lima",
    "venezuela": "America/Caracas",
    "uruguay": "America/Montevideo",
    "paraguay": "America/Asuncion",
    "bolivia": "America/La_Paz",
    "equador": "America/Guayaquil", "ecuador": "America/Guayaquil",
    "guiana": "America/Guyana",
    "suriname": "America/Paramaribo",

    // --- AMÉRICA CENTRAL E CARIBE ---
    "mexico": "America/Mexico_City",
    "cuba": "America/Havana",
    "republicadominicana": "America/Santo_Domingo", "dominicanrepublic": "America/Santo_Domingo",
    "haiti": "America/Port-au-Prince",
    "jamaica": "America/Jamaica",
    "costarica": "America/Costa_Rica",
    "panama": "America/Panama",
    "guatemala": "America/Guatemala",
    "honduras": "America/Tegucigalpa",
    "elsalvador": "America/El_Salvador", "salvador": "America/El_Salvador",
    "nicaragua": "America/Managua",

    // --- AMÉRICA DO NORTE ---
    "estadosunidos": "America/New_York", "unitedstates": "America/New_York", "eua": "America/New_York", "usa": "America/New_York",
    "canada": "America/Toronto",

    // --- EUROPA ---
    "portugal": "Europe/Lisbon",
    "espanha": "Europe/Madrid", "spain": "Europe/Madrid",
    "franca": "Europe/Paris", "france": "Europe/Paris",
    "reinounido": "Europe/London", "unitedkingdom": "Europe/London", "inglaterra": "Europe/London", "uk": "Europe/London",
    "italia": "Europe/Rome", "italy": "Europe/Rome",
    "alemanha": "Europe/Berlin", "germany": "Europe/Berlin",
    "suica": "Europe/Zurich", "switzerland": "Europe/Zurich",
    "belgica": "Europe/Brussels", "belgium": "Europe/Brussels",
    "holanda": "Europe/Amsterdam", "netherlands": "Europe/Amsterdam",
    "sucia": "Europe/Stockholm", "sweden": "Europe/Stockholm",
    "noruega": "Europe/Oslo", "norway": "Europe/Oslo",
    "dinamarca": "Europe/Copenhagen", "denmark": "Europe/Copenhagen",
    "finlandia": "Europe/Helsinki", "finland": "Europe/Helsinki",
    "islandia": "Atlantic/Reykjavik", "iceland": "Atlantic/Reykjavik",
    "irlanda": "Europe/Dublin", "ireland": "Europe/Dublin",
    "polonia": "Europe/Warsaw", "poland": "Europe/Warsaw",
    "ucrania": "Europe/Kyiv", "ukraine": "Europe/Kyiv",
    "russia": "Europe/Moscow",
    "grecia": "Europe/Athens", "greece": "Europe/Athens",
    "austria": "Europe/Vienna",
    "turquia": "Europe/Istanbul", "turkey": "Europe/Istanbul",

    // --- ÁSIA E OCEANIA ---
    "japao": "Asia/Tokyo", "japan": "Asia/Tokyo",
    "china": "Asia/Shanghai",
    "india": "Asia/Kolkata",
    "coreiadosul": "Asia/Seoul", "southkorea": "Asia/Seoul",
    "emiradosarabesunidos": "Asia/Dubai", "uae": "Asia/Dubai",
    "arabiasaudita": "Asia/Riyadh", "saudiarabia": "Asia/Riyadh",
    "israel": "Asia/Jerusalem",
    "indonesia": "Asia/Jakarta",
    "tailandia": "Asia/Bangkok", "thailand": "Asia/Bangkok",
    "singapura": "Asia/Singapore", "singapore": "Asia/Singapore",
    "australia": "Australia/Sydney",
    "novazelandia": "Pacific/Auckland", "newzealand": "Pacific/Auckland"
};

function obterFusoPorPais(paisStr) {
    if (!paisStr) return 'UTC';

    const paisLimpo = String(paisStr)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    return dicionarioPaisesMundial[paisLimpo] || 'UTC';
}

module.exports = { obterFusoPorPais };
