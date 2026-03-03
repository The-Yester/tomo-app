const axios = require('axios');
const fs = require('fs');

const { APPLE_MUSIC_TOKEN } = require('../api/AppleMusicConfig');
const token = APPLE_MUSIC_TOKEN;

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';
const headers = { Authorization: `Bearer ${token}` };

const TIME_CAPSULE_DATA = {
    '1980': { name: 'Back in Black', artist: 'AC/DC' },
    '1981': { name: 'Tattoo You', artist: 'The Rolling Stones' },
    '1982': { name: 'Thriller', artist: 'Michael Jackson' },
    '1983': { name: 'Synchronicity', artist: 'The Police' },
    '1984': { name: 'Purple Rain', artist: 'Prince' },
    '1985': { name: 'No Jacket Required', artist: 'Phil Collins' },
    '1986': { name: 'Slippery When Wet', artist: 'Bon Jovi' },
    '1987': { name: 'The Joshua Tree', artist: 'U2' },
    '1988': { name: 'Faith', artist: 'George Michael' },
    '1989': { name: 'Like a Prayer', artist: 'Madonna' },
    '1990': { name: 'Please Hammer, Don\'t Hurt \'Em', artist: 'MC Hammer' },
    '1991': { name: 'Nevermind', artist: 'Nirvana' },
    '1992': { name: 'The Bodyguard', artist: 'Whitney Houston' },
    '1993': { name: 'Music Box', artist: 'Mariah Carey' },
    '1994': { name: 'The Lion King', artist: 'Soundtrack' },
    '1995': { name: 'Cracked Rear View', artist: 'Hootie & the Blowfish' },
    '1996': { name: 'Jagged Little Pill', artist: 'Alanis Morissette' },
    '1997': { name: 'Spice', artist: 'Spice Girls' },
    '1998': { name: 'Titanic', artist: 'Soundtrack' },
    '1999': { name: 'Millennium', artist: 'Backstreet Boys' },
    '2000': { name: 'No Strings Attached', artist: 'NSYNC' },
    '2001': { name: 'Hybrid Theory', artist: 'Linkin Park' },
    '2002': { name: 'The Eminem Show', artist: 'Eminem' },
    '2003': { name: 'Get Rich or Die Tryin\'', artist: '50 Cent' },
    '2004': { name: 'Confessions', artist: 'Usher' },
    '2005': { name: 'The Emancipation of Mimi', artist: 'Mariah Carey' },
    '2006': { name: 'High School Musical', artist: 'Soundtrack' },
    '2007': { name: 'Daughtry', artist: 'Daughtry' },
    '2008': { name: 'Tha Carter III', artist: 'Lil Wayne' },
    '2009': { name: 'Fearless', artist: 'Taylor Swift' },
    '2010': { name: 'Recovery', artist: 'Eminem' },
    '2011': { name: '21', artist: 'Adele' },
    '2012': { name: 'Red', artist: 'Taylor Swift' },
    '2013': { name: 'The 20/20 Experience', artist: 'Justin Timberlake' },
    '2014': { name: '1989', artist: 'Taylor Swift' },
    '2015': { name: '25', artist: 'Adele' },
    '2016': { name: 'Views', artist: 'Drake' },
    '2017': { name: 'Damn.', artist: 'Kendrick Lamar' },
    '2018': { name: 'Scorpion', artist: 'Drake' },
    '2019': { name: 'When We All Fall Asleep', artist: 'Billie Eilish' },
    '2020': { name: 'Folklore', artist: 'Taylor Swift' },
    '2021': { name: '30', artist: 'Adele' },
    '2022': { name: 'Un Verano Sin Ti', artist: 'Bad Bunny' },
    '2023': { name: 'Midnights', artist: 'Taylor Swift' },
};

async function fetchIds() {
    let result = {};
    for (const year of Object.keys(TIME_CAPSULE_DATA)) {
        const item = TIME_CAPSULE_DATA[year];
        const query = `${item.name} ${item.artist}`;
        try {
            const res = await axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/search`, {
                headers,
                params: { term: query, types: 'albums', limit: 1 }
            });
            const albums = res.data.results?.albums?.data;
            if (albums && albums.length > 0) {
                result[year] = {
                    id: albums[0].id,
                    name: albums[0].attributes.name,
                    artist: albums[0].attributes.artistName,
                    image: albums[0].attributes.artwork.url
                };
            } else {
                result[year] = { id: 'error', name: item.name, artist: item.artist, image: '' };
            }
        } catch (e) {
            result[year] = { id: 'error', name: item.name, artist: item.artist, image: '' };
        }
        await new Promise(r => setTimeout(r, 200));
    }
    fs.writeFileSync('c:/dev/TOMO/scripts/ids.json', JSON.stringify(result, null, 2), 'utf8');
    console.log("Done. Wrote ids.json");
}

fetchIds();
