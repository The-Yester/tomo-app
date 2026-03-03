const fs = require('fs');
const dataFile = 'c:/dev/TOMO/scripts/ids.json';
const musicServiceFile = 'c:/dev/TOMO/api/MusicService.js';

const idsData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

let newDataStr = 'const TIME_CAPSULE_DATA = {\n';
for (const year of Object.keys(idsData)) {
    const item = idsData[year];
    // escape quotes in names just in case
    const nameStr = item.name.replace(/'/g, "\\'");
    newDataStr += `    '${year}': { id: '${item.id}', name: '${nameStr}', artist: '${item.artist}', image: '${item.image}' },\n`;
}
newDataStr += '};';

let code = fs.readFileSync(musicServiceFile, 'utf8');

// replace the block between const TIME_CAPSULE_DATA = { and the closing };
const regex = /const TIME_CAPSULE_DATA = \{[\s\S]*?\};\n/;
if (regex.test(code)) {
    code = code.replace(regex, newDataStr + '\n');
    fs.writeFileSync(musicServiceFile, code, 'utf8');
    console.log("Successfully updated TIME_CAPSULE_DATA in MusicService.js");
} else {
    console.log("Could not find TIME_CAPSULE_DATA block using regex.");
}
