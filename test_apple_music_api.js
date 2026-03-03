const fs = require('fs');

// Note: To test this in node, you might need to extract the token from AppleMusicConfig.js
const tokenPath = './api/AppleMusicConfig.js';
let token = '';

try {
    const content = fs.readFileSync(tokenPath, 'utf8');
    const tokenMatch = content.match(/export const APPLE_MUSIC_TOKEN = '(.*?)';/);
    if (tokenMatch && tokenMatch[1]) {
        token = tokenMatch[1];
    } else {
        console.error('Could not find APPLE_MUSIC_TOKEN in AppleMusicConfig.js');
        process.exit(1);
    }
} catch (e) {
    console.error('Error reading config:', e.message);
    process.exit(1);
}

async function testSearch(query) {
    const url = `https://api.music.apple.com/v1/catalog/us/search?term=${encodeURIComponent(query)}&types=albums,artists&limit=2`;
    console.log(`Testing search for "${query}"...`);
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error(`Error ${response.status}: ${response.statusText}`);
            const text = await response.text();
            console.error('Response body:', text);
            return false;
        }

        const data = await response.json();
        console.log(`Success! Found ${data.results?.albums?.data?.length || 0} albums.`);
        return true;
    } catch (error) {
        console.error('Fetch error:', error);
        return false;
    }
}

async function runTests() {
    console.log('Testing Apple Music API connection...\n');

    // Test basic connectivity
    const success = await testSearch('pop');

    if (success) {
        console.log('\nTesting rapid requests to check rate limits...');
        let successCount = 0;
        let failCount = 0;

        // Fire 10 rapid requests
        for (let i = 0; i < 10; i++) {
            process.stdout.write(`Req ${i + 1}... `);
            const res = await testSearch(`test${i}`);
            if (res) successCount++;
            else failCount++;
        }
        console.log(`\nRate limit test complete: ${successCount} succeeded, ${failCount} failed.`);
    }
}

runTests();
