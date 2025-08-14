const fs = require('fs');
const path = require('path');

const CSV_FILE = './itemlist.csv';
const limitPrefijo = 3; // Número de caracteres a tomar del inicio del ID

// Leer archivo CSV
const csvData = fs.readFileSync(path.resolve(CSV_FILE), 'utf8');

// Separar por líneas y limpiar
const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');

// Obtener prefijos únicos
const prefixes = new Set();

for (const line of lines) {
    const firstCol = line.split(',')[0].replace(/^"|"$/g, '').trim(); // Quitar comillas y espacios
    if (firstCol.length >= limitPrefijo) {
        prefixes.add(firstCol.slice(0, limitPrefijo)); // Tomar solo el prefijo
    }
}

// Array limpio
const prefixArray = Array.from(prefixes);

// Guardar como JSON
fs.writeFileSync('./prefixes.json', JSON.stringify(prefixArray, null, 2), 'utf8');