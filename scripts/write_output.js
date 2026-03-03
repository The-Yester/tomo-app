const fs = require('fs');
const dataFile = 'c:/dev/TOMO/scripts/ids.json';
const idsData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

let newDataStr = '';
for (const year of Object.keys(idsData)) {
    const item = idsData[year];
    const nameStr = item.name.replace(/'/g, "\\'");
    newDataStr += `    '${year}': { id: '${item.id}', name: '${nameStr}', artist: '${item.artist}', image: '${item.image}' },\n`;
}

fs.writeFileSync('c:/dev/TOMO/scripts/output_string.txt', newDataStr, 'utf8');
console.log("Written output_string.txt");
