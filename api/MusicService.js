import axios from 'axios';
import { db } from '../firebaseConfig';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, getDoc, deleteDoc } from 'firebase/firestore';
import { APPLE_MUSIC_API_BASE, getAppleMusicHeaders } from './AppleMusicConfig';

// --- API QUEUE (Rate Limiter with Cancellation Support) ---
// Apple Music API can return 429 if too many requests hit at once (e.g., from Promise.all)
class RequestQueue {
    constructor() {
        this.queue = [];
        this.activeRequests = new Map(); // category -> active request item
        this.isProcessing = false;
        // Delay between requests in ms
        this.delay = 250;
    }

    add(requestFn, category = 'default') {
        const controller = new AbortController();

        return new Promise((resolve, reject) => {
            // Cancel existing request in the same category
            if (category !== 'default') {
                this.cancelCategory(category);
            }

            const item = {
                requestFn,
                resolve,
                reject,
                category,
                controller
            };

            this.queue.push(item);

            // Track queued request for this category
            if (category !== 'default') {
                this.activeRequests.set(category, item);
            }

            this.processQueue();
        });
    }

    cancelCategory(category) {
        // Remove from queue and reject
        this.queue = this.queue.filter(item => {
            if (item.category === category) {
                item.controller.abort();
                const err = new Error('Aborted');
                err.name = 'AbortError';
                item.reject(err);
                return false;
            }
            return true;
        });

        // Abort running request if it's the active one
        const active = this.activeRequests.get(category);
        if (active) {
            active.controller.abort();
            const err = new Error('Aborted');
            err.name = 'AbortError';
            active.reject(err);
            this.activeRequests.delete(category);
        }
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            const { requestFn, resolve, reject, category, controller } = item;

            // If it was already aborted while in the queue, skip it
            if (controller.signal.aborted) {
                continue;
            }

            // Set as active request for the category while it runs
            if (category !== 'default') {
                this.activeRequests.set(category, item);
            }

            try {
                // Pass the abort signal to the request function
                const result = await requestFn(controller.signal);
                
                // If it was aborted during execution, reject it
                if (controller.signal.aborted) {
                    const err = new Error('Aborted');
                    err.name = 'AbortError';
                    reject(err);
                } else {
                    resolve(result);
                }
            } catch (error) {
                if (axios.isCancel(error) || error.name === 'AbortError' || error.message === 'canceled') {
                    const err = new Error('Aborted');
                    err.name = 'AbortError';
                    reject(err);
                } else {
                    reject(error);
                }
            } finally {
                if (category !== 'default' && this.activeRequests.get(category) === item) {
                    this.activeRequests.delete(category);
                }
            }

            // Wait before next request
            if (this.queue.length > 0) {
                await new Promise(r => setTimeout(r, this.delay));
            }
        }

        this.isProcessing = false;
    }
}

const apiQueue = new RequestQueue();

// Helper to format artwork URL
export const formatArtworkUrl = (url, width = 300, height = 300) => {
    if (!url) return 'https://via.placeholder.com/300';
    return url.replace('{w}', width).replace('{h}', height);
};

// --- API FUNCTIONS ---

// Caches for search queries and search hints
const searchCache = new Map();
const hintCache = new Map();
const SEARCH_CACHE_LIMIT = 100;
const HINTS_CACHE_LIMIT = 100;

export const searchMusic = async (searchQuery) => {
    if (!searchQuery || searchQuery.trim() === '') return [];

    const cleanQuery = searchQuery.trim();
    const cacheKey = cleanQuery.toLowerCase();

    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey);
    }

    try {
        const response = await apiQueue.add((signal) => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/search`, {
            headers: getAppleMusicHeaders(),
            signal,
            params: {
                term: cleanQuery,
                types: 'albums,artists',
                limit: 15
            }
        }), 'search');

        const rawAlbums = response.data.results?.albums?.data || [];
        const artists = response.data.results?.artists?.data || [];

        let finalAlbums = [];

        // If we found an artist that perfectly or closely matches the query, 
        // aggressively fetch their top albums and push them to the front.
        if (artists.length > 0) {
            const topArtistId = artists[0].id;
            try {
                const artistAlbumsResponse = await apiQueue.add((signal) => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/artists/${topArtistId}/albums`, {
                    headers: getAppleMusicHeaders(),
                    signal,
                    params: {
                        limit: 15
                    }
                }), 'search');

                const artistAlbums = artistAlbumsResponse.data.data || [];
                finalAlbums = [...artistAlbums];
            } catch (artistErr) {
                if (artistErr.name === 'AbortError') throw artistErr;
                console.error("Error fetching artist's top albums for search priority:", artistErr.message);
            }
        }

        const uniqueAlbumsMap = new Map();

        // Helper to add albums while avoiding duplicates (clean vs explicit)
        const addAlbumUnique = (album) => {
            const name = album.attributes?.name?.toLowerCase().trim() || '';
            const artist = album.attributes?.artistName?.toLowerCase().trim() || '';
            const sig = `${name}::${artist}`;

            // If we haven't seen this name/artist combo, or if the new one is explicitly an album and the old one was a single, replace it
            if (!uniqueAlbumsMap.has(sig)) {
                uniqueAlbumsMap.set(sig, album);
            }
        };

        // Add artist's top albums first
        finalAlbums.forEach(addAlbumUnique);

        // Add raw search results
        rawAlbums.forEach(addAlbumUnique);

        // Convert back to array
        let processedAlbums = Array.from(uniqueAlbumsMap.values());

        // Sort Albums: Albums first, Singles last. Then sort by releaseDate descending
        processedAlbums.sort((a, b) => {
            const aName = (a.attributes?.name || '').toLowerCase();
            const bName = (b.attributes?.name || '').toLowerCase();

            const aIsSingle = a.attributes?.isSingle || aName.includes('- single') || aName.includes('(single)');
            const bIsSingle = b.attributes?.isSingle || bName.includes('- single') || bName.includes('(single)');

            if (aIsSingle && !bIsSingle) return 1;  // Demote 'a' (Single)
            if (!aIsSingle && bIsSingle) return -1; // Promote 'a' (Album)

            // Both are same type, sort by release date (newest first)
            const dateA = new Date(a.attributes?.releaseDate || '1970-01-01');
            const dateB = new Date(b.attributes?.releaseDate || '1970-01-01');
            return dateB - dateA;
        });

        // 🟢 NEW: Add actual artist profiles to the very top if any were matched
        const mappedArtists = artists.map(artist => ({
            id: artist.id,
            type: 'artists',
            attributes: {
                name: artist.attributes?.name,
                artistName: 'Artist',
                // Artists usually don't return artwork in the standard US Search query unless expanded, 
                // but we map it just in case, or we use a fallback placeholder icon in the UI
                artwork: artist.attributes?.artwork || null
            }
        }));

        // Combine: Artists at the top, then Albums
        const finalCombinedResults = [...mappedArtists, ...processedAlbums];

        // Cache the result
        if (searchCache.size >= SEARCH_CACHE_LIMIT) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }
        searchCache.set(cacheKey, finalCombinedResults);

        return finalCombinedResults;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }
        console.error('Error searching Apple Music:', error.response?.data || error.message);
        return [];
    }
};

export const getSearchHints = async (term) => {
    if (!term || term.trim() === '') return [];
    
    const cleanQuery = term.trim();
    const cacheKey = cleanQuery.toLowerCase();

    if (hintCache.has(cacheKey)) {
        return hintCache.get(cacheKey);
    }

    try {
        const response = await apiQueue.add((signal) => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/search/hints`, {
            headers: getAppleMusicHeaders(),
            signal,
            params: {
                term: cleanQuery,
                limit: 10
            }
        }), 'hints');
        
        const hints = response.data.results?.terms || [];

        // Cache the hints
        if (hintCache.size >= HINTS_CACHE_LIMIT) {
            const firstKey = hintCache.keys().next().value;
            hintCache.delete(firstKey);
        }
        hintCache.set(cacheKey, hints);

        return hints;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }
        console.error('Error fetching search hints:', error.response?.data || error.message);
        return [];
    }
};

export const getAlbumDetails = async (albumId) => {
    try {
        const response = await apiQueue.add(() => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/albums/${albumId}`, {
            headers: getAppleMusicHeaders()
        }));

        if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return null;
    } catch (error) {
        // Silently catch 404s (e.g. when an album is removed from Apple Music)
        if (error.response?.status === 404) {
            return null;
        }
        console.error('Error fetching album details:', error.response?.data || error.message);
        return null;
    }
};

export const getTopCharts = async () => {
    try {
        const response = await apiQueue.add(() => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/charts`, {
            headers: getAppleMusicHeaders(),
            params: {
                types: 'albums',
                limit: 10
            }
        }));

        if (response.data.results?.albums && response.data.results.albums.length > 0) {
            return response.data.results.albums[0].data; // Returns the array of top albums
        }
        return [];
    } catch (error) {
        console.error('Error fetching top charts:', error.response?.data || error.message);
        return [];
    }
};

export const getNewReleases = async () => {
    try {
        // Apple Music API doesn't have a direct "new releases" endpoint for all genres easily accessible without user auth.
        // As a fallback, we grab a specific curated Apple Music playlist for new music, or re-use charts.
        // For demonstration, grabbing a known playlist (e.g., "New Music Daily" - pl.2b0e6e332fdf4b7a91164da3162127b5)
        // Adjusting to just return Top Charts for now to ensure data loads.
        const response = await apiQueue.add(() => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/charts`, {
            headers: getAppleMusicHeaders(),
            params: {
                types: 'albums',
                limit: 15
            }
        }));

        if (response.data.results?.albums && response.data.results.albums.length > 0) {
            // Reverse or shuffle to simulate different content
            return response.data.results.albums[0].data.slice().reverse();
        }
        return [];
    } catch (error) {
        console.error('Error fetching new releases:', error.response?.data || error.message);
        return [];
    }
};


export const getUpcomingReleases = async () => {
    // Apple Music API does not explicitly expose an "upcoming" endpoint. 
    // This typically requires editorial data or a custom backend to scrape/curate.
    // Returning empty array or mock data for now.
    return [];
};

export const getArtistDetails = async (artistId) => {
    try {
        const response = await apiQueue.add(() => axios.get(`${APPLE_MUSIC_API_BASE}/catalog/us/artists/${artistId}`, {
            headers: getAppleMusicHeaders(),
            params: {
                include: 'albums'
            }
        }));

        if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return null;
    } catch (error) {
        console.error('Error fetching artist details:', error.response?.data || error.message);
        return null;
    }
};

// --- Curated Corner (Social) ---

export const subscribeToCurations = (callback) => {
    const q = query(collection(db, "curations"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
        const curations = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        callback(curations);
    });
};

export const addCuration = async (curationData) => {
    // curationData: { title, description, albums: [], userId, username, userPhoto, timestamp }
    // Clean payload of any `undefined` properties since Firebase strictly blocks them
    const sanitizedData = JSON.parse(JSON.stringify(curationData));

    // JSON.stringify strips Date objects into ISO strings, but Firebase prefers real timestamps or ISO strings depending on schema. 
    // We'll preserve the actual timestamp object explicitly just in case JSON.stringify breaks it:
    if (curationData.timestamp) {
        sanitizedData.timestamp = curationData.timestamp;
    }

    return await addDoc(collection(db, "curations"), sanitizedData);
};

export const deleteCuration = async (curationId) => {
    if (!curationId) return;
    try {
        await deleteDoc(doc(db, "curations", curationId));
    } catch (error) {
        console.error("Error deleting curation:", error);
        throw error;
    }
};

export const likeCuration = async (curationId, userId, currentLikes, currentLikedBy) => {
    const ref = doc(db, "curations", curationId);
    if (currentLikedBy.includes(userId)) {
        await updateDoc(ref, {
            likes: (currentLikes || 1) - 1,
            likedBy: arrayRemove(userId)
        });
    } else {
        await updateDoc(ref, {
            likes: (currentLikes || 0) + 1,
            likedBy: arrayUnion(userId)
        });
    }
};

export const followUser = async (currentUid, targetUid) => {
    if (!currentUid || !targetUid) return;
    const currentUserRef = doc(db, "users", currentUid);
    const targetRef = doc(db, "users", targetUid);

    // Add target to my 'following'
    await updateDoc(currentUserRef, {
        following: arrayUnion({ uid: targetUid, timestamp: new Date() })
    });

    // Add me to target's 'followers'
    await updateDoc(targetRef, {
        followers: arrayUnion({ uid: currentUid, timestamp: new Date() })
    });
};

export const unfollowUser = async (currentUid, targetUid) => {
    if (!currentUid || !targetUid) return;
    const currentUserRef = doc(db, "users", currentUid);
    const targetRef = doc(db, "users", targetUid);

    // We need to remove objects, but arrayRemove requires exact object match.
    // For simplicity in this architecture, we'll read-modify-write or assume simple array of UIDs if we refactored.
    // Given the previous FollowListScreen implementation, it seems 'following' stores objects {uid: ...}.
    // To properly remove, we should read the list, filter, and write back.

    // 1. Remove from my 'following'
    const userSnap = await getDoc(currentUserRef);
    if (userSnap.exists()) {
        const currentFollowing = userSnap.data().following || [];
        const newFollowing = currentFollowing.filter(f => f.uid !== targetUid);
        await updateDoc(currentUserRef, { following: newFollowing });
    }

    // 2. Remove me from their 'followers'
    const targetSnap = await getDoc(targetRef);
    if (targetSnap.exists()) {
        const currentFollowers = targetSnap.data().followers || [];
        const newFollowers = currentFollowers.filter(f => f.uid !== currentUid);
        await updateDoc(targetRef, { followers: newFollowers });
    }
};

// --- Physical Collection ---

export const addPhysicalAlbum = async (userId, album, format) => {
    if (!userId || !album || !format) return;
    try {
        const physicalRef = doc(db, 'users', userId, 'physical_collection', `${album.id}_${format}`);
        await updateDoc(physicalRef, {
            id: album.id,
            name: album.name || album.attributes?.name || '',
            artistName: album.artistName || album.attributes?.artistName || '',
            artwork: album.artwork || album.attributes?.artwork || null,
            format: format,
            addedAt: new Date(),
        });
    } catch (error) {
        if (error.code === 'not-found') {
            const physicalRef = doc(db, 'users', userId, 'physical_collection', `${album.id}_${format}`);
            await updateDoc(doc(db, 'users', userId), { _dummy: true }); // Ensure user doc exists, though it should
            // Use setDoc instead of updateDoc since the doc is new
            const { setDoc } = require('firebase/firestore');
            await setDoc(physicalRef, {
                id: album.id,
                name: album.name || album.attributes?.name || '',
                artistName: album.artistName || album.attributes?.artistName || '',
                artwork: album.artwork || album.attributes?.artwork || null,
                format: format,
                addedAt: new Date(),
            });
        } else {
            console.error('Error adding to physical collection:', error);
            throw error;
        }
    }
};

export const removePhysicalAlbum = async (userId, albumId, format) => {
    if (!userId || !albumId || !format) return;
    try {
        const physicalRef = doc(db, 'users', userId, 'physical_collection', `${albumId}_${format}`);
        // We need deleteDoc imported if not already. It is imported at the top.
        await deleteDoc(physicalRef);
    } catch (error) {
        console.error('Error removing from physical collection:', error);
        throw error;
    }
};

export const getPhysicalCollection = async (userId) => {
    if (!userId) return [];
    try {
        const { getDocs } = require('firebase/firestore');
        const q = query(collection(db, 'users', userId, 'physical_collection'), orderBy('addedAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.data().id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching physical collection:', error);
        return [];
    }
};


// --- Time Capsule Mock Data ---
const TIME_CAPSULE_DATA = {
    '1980': { id: '574050396', name: 'Back In Black', artist: 'AC/DC', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/14/58/1e145814-281a-58e0-3ab1-145f5d1af421/886443673441.jpg/{w}x{h}bb.jpg' },
    '1981': { id: '1584840337', name: 'Tattoo You (Deluxe Edition)', artist: 'The Rolling Stones', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/65/91/64/65916436-92ec-93f5-044f-55eece524712/21UMGIM80854.rgb.jpg/{w}x{h}bb.jpg' },
    '1982': { id: '269572838', name: 'Thriller', artist: 'Michael Jackson', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/32/4f/fd/324ffda2-9e51-8f6a-0c2d-c6fd2b41ac55/074643811224.jpg/{w}x{h}bb.jpg' },
    '1983': { id: '1440673959', name: 'Synchronicity (Remastered 2003)', artist: 'The Police', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a4/67/ba/a467ba62-87df-9d10-98d2-c517f68ac870/16UMGIM60882.rgb.jpg/{w}x{h}bb.jpg' },
    '1984': { id: '1229320468', name: 'Purple Rain (Deluxe Expanded Edition) [2015 Paisley Park Remaster]', artist: 'Prince & The Revolution', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c1/b6/79/c1b679f5-d59d-1b3e-62ab-514de20f06c6/093624912002.jpg/{w}x{h}bb.jpg' },
    '1985': { id: '1088551708', name: 'No Jacket Required (Deluxe Edition) [Remastered]', artist: 'Phil Collins', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a7/b8/da/a7b8dac2-6080-2dbb-885e-82c067c256a2/mzm.qaeccumq.jpg/{w}x{h}bb.jpg' },
    '1986': { id: '1422954626', name: 'Slippery When Wet', artist: 'Bon Jovi', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/40/16/3e/40163e24-6985-b785-d4ea-cbae07d74812/06UMGIM05422.rgb.jpg/{w}x{h}bb.jpg' },
    '1987': { id: '1443155637', name: 'The Joshua Tree', artist: 'U2', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/8f/e2/c3/8fe2c384-f6cb-9af7-371d-2b6a9b204e59/17UMGIM79292.rgb.jpg/{w}x{h}bb.jpg' },
    '1988': { id: '395918916', name: 'Faith (2010 Remastered)', artist: 'George Michael', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/87/29/d2/8729d243-f06f-e588-3ddf-ffa87a2ce17e/mzi.yupygcca.jpg/{w}x{h}bb.jpg' },
    '1989': { id: '83448003', name: 'Like a Prayer', artist: 'Madonna', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/20/3c/f5/203cf53d-689e-528f-29d7-ba33758254aa/mzi.rotbotfl.jpg/{w}x{h}bb.jpg' },
    '1990': { id: '724314907', name: 'Please Hammer Don\'t Hurt \'Em', artist: 'MC Hammer', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/88/3d/74/883d74ea-aa53-99d8-e00c-f38fbba93d1d/13UABIM56742.rgb.jpg/{w}x{h}bb.jpg' },
    '1991': { id: '1440783617', name: 'Nevermind', artist: 'Nirvana', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/95/fd/b9/95fdb9b2-6d2b-92a6-97f2-51c1a6d77f1a/00602527874609.rgb.jpg/{w}x{h}bb.jpg' },
    '1992': { id: '388151892', name: 'The Bodyguard (Original Soundtrack Album)', artist: 'Whitney Houston', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/82/f3/e9/82f3e968-8174-c5eb-7fc5-36384d050129/dj.mdauihuy.jpg/{w}x{h}bb.jpg' },
    '1993': { id: '1706160663', name: 'Music Box', artist: 'Mariah Carey', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/1a/c7/08/1ac708ec-f080-71f5-0580-ff81bc48b0e6/196871356909.jpg/{w}x{h}bb.jpg' },
    '1994': { id: '1445732923', name: 'The Lion King (Original Motion Picture Soundtrack)', artist: 'Elton John & Tim Rice, Hans Zimmer', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/80/89/ce808921-d594-fa7f-03e8-adcc92a69de8/06PNDIM00020.rgb.jpg/{w}x{h}bb.jpg' },
    '1995': { id: '296202515', name: 'Cracked Rear View', artist: 'Hootie & The Blowfish', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/de/a8/c7/dea8c705-2f1d-a0d3-b97f-a32d064f43f5/mzi.imcehhmk.jpg/{w}x{h}bb.jpg' },
    '1996': { id: '1031419290', name: 'Jagged Little Pill (Collector\'s Edition)', artist: 'Alanis Morissette', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music4/v4/4d/04/71/4d0471a5-3bd6-2c5b-a438-3568fcd70e1c/603497885510.jpg/{w}x{h}bb.jpg' },
    '1997': { id: '714657231', name: 'Greatest Hits', artist: 'Spice Girls', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/dd/28/ab/dd28ab3d-d312-3773-0e10-5da357444982/13UABIM55474.rgb.jpg/{w}x{h}bb.jpg' },
    '1998': { id: '507536640', name: 'Titanic (Music from the Motion Picture) [Collector\'s Anniversary Edition]', artist: 'James Horner', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/ab/5a/96/ab5a9681-e891-8449-53d2-7d358501f97f/mzi.zbauexhy.jpg/{w}x{h}bb.jpg' },
    '1999': { id: '1795046348', name: 'Millennium 2.0', artist: 'Backstreet Boys', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1e/74/29/1e74299f-697d-e334-1456-8bf680e7f888/196872361513.jpg/{w}x{h}bb.jpg' },
    '2000': { id: '303171298', name: 'No Strings Attached', artist: '*NSYNC', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/36/22/d6/3622d665-873c-57b8-392b-971292e6086f/012414170224.jpg/{w}x{h}bb.jpg' },
    '2001': { id: '590431776', name: 'Hybrid Theory (Deluxe Edition)', artist: 'LINKIN PARK', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/53/a7/7f/53a77fab-c54c-a57b-8130-248fc12d0c80/093624948995.jpg/{w}x{h}bb.jpg' },
    '2002': { id: '1625004609', name: 'The Eminem Show (Expanded Edition)', artist: 'Eminem', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/c9/02/cd/c902cdef-e179-5b70-8142-112a2abe7f27/22UMGIM49875.rgb.jpg/{w}x{h}bb.jpg' },
    '2003': { id: '1440841450', name: 'Get Rich or Die Tryin\' (Bonus Track Version)', artist: '50 Cent', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/51/a6/c9/51a6c989-f81d-42b3-c94c-e889a7c07885/06UMGIM15592.rgb.jpg/{w}x{h}bb.jpg' },
    '2004': { id: '386153476', name: 'Confessions (Expanded Edition)', artist: 'USHER', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/02/c6/e1/02c6e1cd-8d57-97b4-6ef1-77d2be004509/mzi.sjrqsmrq.jpg/{w}x{h}bb.jpg' },
    '2005': { id: '1476731879', name: 'The Emancipation Of Mimi', artist: 'Mariah Carey', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/34/66/31/346631f0-dc0e-500f-7cb8-537e7523e022/15UMGIM78299.rgb.jpg/{w}x{h}bb.jpg' },
    '2006': { id: '1440769028', name: 'High School Musical 2 (Original Soundtrack)', artist: 'The Cast of High School Musical', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/0e/fb/4c/0efb4cd8-02e1-ec02-4921-ebd053b737be/09BVMIM00784.rgb.jpg/{w}x{h}bb.jpg' },
    '2007': { id: '214412700', name: 'Daughtry', artist: 'Daughtry', image: 'https://is1-ssl.mzstatic.com/image/thumb/Features124/v4/ad/b9/9b/adb99b4b-a2f5-02f8-c9cb-90cbc95b3918/dj.qkzhughs.jpg/{w}x{h}bb.jpg' },
    '2008': { id: '1440738372', name: 'Tha Carter III', artist: 'Lil Wayne', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f9/6c/dc/f96cdc5c-09fe-06b6-4629-be4afeb71cca/08UMGIM15512.rgb.jpg/{w}x{h}bb.jpg' },
    '2009': { id: '1440924803', name: 'Fearless', artist: 'Taylor Swift', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cb/6e/a7/cb6ea70a-6cb8-89a0-4da7-91e2d04a7bba/08PNDIM05386.rgb.jpg/{w}x{h}bb.jpg' },
    '2010': { id: '1446625834', name: 'Recovery (Deluxe Edition)', artist: 'Eminem', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/1f/8b/b0/1f8bb023-f4cd-d4e1-7251-957c6bf2e942/10UMGIM14533.rgb.jpg/{w}x{h}bb.jpg' },
    '2011': { id: '1544491232', name: '21', artist: 'Adele', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/eb/ca/25/ebca2596-cd1e-b295-91a3-771c868d0a79/191404113868.png/{w}x{h}bb.jpg' },
    '2012': { id: '1440935340', name: 'Red', artist: 'Taylor Swift', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/25/0d/7e/250d7e42-3a2f-19ac-f865-f1e04a4a1f97/12UMDIM01007.rgb.jpg/{w}x{h}bb.jpg' },
    '2013': { id: '1441493446', name: 'The 20/20 Experience (Deluxe Version)', artist: 'Justin Timberlake', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/53/74/c9/5374c99e-cff1-61a6-ca0f-fa1219d050a0/886443854406.jpg/{w}x{h}bb.jpg' },
    '2014': { id: '1440935467', name: '1989', artist: 'Taylor Swift', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/89/4a/4a/894a4ab9-b0b0-9ea5-ca41-8da0b9b79453/14UMDIM03405.rgb.jpg/{w}x{h}bb.jpg' },
    '2015': { id: '1544494115', name: '25', artist: 'Adele', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/08/8c/24/088c2405-2e33-801b-5c38-e967f2c01e69/191404113974.png/{w}x{h}bb.jpg' },
    '2016': { id: '1440841363', name: 'Views', artist: 'Drake', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f2/0d/8b/f20d8bff-a927-ae98-6784-20a1f51cb23e/16UMGIM27642.rgb.jpg/{w}x{h}bb.jpg' },
    '2017': { id: '1440881047', name: 'DAMN.', artist: 'Kendrick Lamar', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/86/c9/bb/86c9bb30-fe3d-442e-33c1-c106c4d23705/17UMGIM88776.rgb.jpg/{w}x{h}bb.jpg' },
    '2018': { id: '1418213110', name: 'Scorpion', artist: 'Drake', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1f/37/43/1f374304-2e04-2be3-53ea-41dd6f0b6fb8/00602567892410.rgb.jpg/{w}x{h}bb.jpg' },
    '2019': { id: '1450695723', name: 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?', artist: 'Billie Eilish', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1a/37/d1/1a37d1b1-8508-54f2-f541-bf4e437dda76/19UMGIM05028.rgb.jpg/{w}x{h}bb.jpg' },
    '2020': { id: '1528112358', name: 'folklore (deluxe version)', artist: 'Taylor Swift', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/b5/80/dc/b580dca0-349d-036b-e09b-bd849f6affd8/20UMGIM64216.rgb.jpg/{w}x{h}bb.jpg' },
    '2021': { id: '1590035691', name: '30', artist: 'Adele', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/73/6d/7c/736d7cfb-c79d-c9a9-4170-5e71d008dea1/886449666430.jpg/{w}x{h}bb.jpg' },
    '2022': { id: '1622045624', name: 'Un Verano Sin Ti', artist: 'Bad Bunny', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/{w}x{h}bb.jpg' },
    '2023': { id: '1689131527', name: 'Midnights (The Til Dawn Edition)', artist: 'Taylor Swift', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/a6/85/b9/a685b9f8-dad3-2ed7-58b2-ab7f64304505/23UMGIM58157.rgb.jpg/{w}x{h}bb.jpg' },
};

export const getTimeCapsuleRecommendation = async (year) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const yearStr = year.toString();
    const data = TIME_CAPSULE_DATA[yearStr];

    if (data) {
        return {
            id: data.id,
            attributes: {
                name: data.name,
                artistName: data.artist,
                artwork: {
                    url: data.image
                },
                releaseDate: `${year}-01-01`,
                genreNames: ['Pop'], // Mock
                editorialNotes: {
                    short: `The #1 Album of ${year}!`
                }
            }
        };
    } else {
        // Fallback for years not in list
        return {
            id: `tc-fallback`,
            attributes: {
                name: `Best of ${year}`,
                artistName: 'Various Artists',
                artwork: {
                    url: 'https://via.placeholder.com/300'
                },
                releaseDate: `${year}-01-01`,
                editorialNotes: {
                    short: `We're still curating the timeline for ${year}.`
                }
            }
        };
    }
};
