const axios = require('axios');
const fs = require('fs');

const APPLE_MUSIC_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjlESDlCVTVBQUMifQ.eyJpYXQiOjE3NzIwNDk3ODksImV4cCI6MTc4NzYwMTc4OSwiaXNzIjoiRzVIWDZVUTY1NyJ9._OUaHLu719zKXOS5ZTaLS7Uwrow8tEaDrGO3pek4fd6tqMrYSzAzGfgPyvp5a4QN1f84F3TNLHR9UIhs1LPbhQ';
const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

async function testSearch() {
    try {
        const res = await axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/search`, {
            headers: {
                'Authorization': `Bearer ${APPLE_MUSIC_TOKEN}`
            },
            params: {
                term: 'Say Anything',
                types: 'artists',
                limit: 5
            }
        });

        const artists = res.data.results.artists.data;
        const output = { searchResults: artists, detailResults: null, error: null };

        if (artists.length > 0) {
            const topArtistId = artists[0].id;
            try {
                const detailsRes = await axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/artists/${topArtistId}`, {
                    headers: {
                        'Authorization': `Bearer ${APPLE_MUSIC_TOKEN}`
                    },
                    params: {
                        include: 'albums'
                    }
                });
                output.detailResults = detailsRes.data;
            } catch (e) {
                output.error = e.response ? e.response.data : e.message;
            }
        }

        fs.writeFileSync('output.json', JSON.stringify(output, null, 2), 'utf8');
    } catch (err) {
        fs.writeFileSync('output.json', JSON.stringify({ error: err.message }, null, 2), 'utf8');
    }
}

testSearch();
