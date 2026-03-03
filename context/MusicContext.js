import React, { createContext, useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, runTransaction, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export const OVERALL_RATINGS_LIST_ID = 'overall_ratings_list_id';
export const OVERALL_RATINGS_LIST_NAME = 'Overall Ratings';

export const MusicContext = createContext({
    musicLists: [],
    overallRatedAlbums: [],
    recentlyPlayed: [],
    recentActivity: [],
    ratingMethod: '1-10', // Default rating method
    setRatingMethod: () => { },
    addList: () => { },
    deleteList: () => { },
    getAlbumsInList: () => [],
    addAlbumToList: () => { },
    removeAlbumFromList: () => { },
    addToRecentlyPlayed: () => { },
    addToRecentActivity: () => { },
    updateOverallRatings: () => { },
    submitRating: () => { }
});

export const MusicProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [musicLists, setMusicLists] = useState([
        { id: 1, name: 'Favorites', albums: [] },
        { id: 2, name: 'Listen Later', albums: [] },
    ]);
    const [overallRatedAlbums, setOverallRatedAlbums] = useState([]);
    const [recentlyPlayed, setRecentlyPlayed] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [ratingMethod, setRatingMethod] = useState('1-10');

    // Listen for Auth Changes to load data
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                await loadUserData(currentUser.uid);
            } else {
                // Reset state on logout
                setMusicLists([
                    { id: 1, name: 'Favorites', albums: [] },
                    { id: 2, name: 'Listen Later', albums: [] },
                ]);
                setOverallRatedAlbums([]);
                setRecentlyPlayed([]);
                setRatingMethod('1-10');
            }
        });
        return unsubscribe;
    }, []);

    // Helper to backfill overallRatedAlbums from subcollection
    const fetchUserRatings = async (uid) => {
        try {
            const ratingsRef = collection(db, "users", uid, "album_ratings");
            const snapshot = await getDocs(ratingsRef);

            if (snapshot.empty) return;

            const restoredAlbums = [];

            for (const docSnap of snapshot.docs) {
                const ratingData = docSnap.data();
                const albumId = docSnap.id;

                // Fetch Album Metadata for display (this might need to be from our own DB cache if we want persistence of metadata)
                // For now, we assume metadata acts similar to movies.
                const albumDocRef = doc(db, "albums", albumId);
                const albumSnap = await getDoc(albumDocRef);

                if (albumSnap.exists()) {
                    const albumMeta = albumSnap.data();
                    restoredAlbums.push({
                        id: albumId,
                        name: albumMeta.name || "Unknown",
                        artistName: albumMeta.artistName || "Unknown",
                        artwork: albumMeta.artwork || null,
                        userOverallRating: ratingData.score,
                        releaseDate: albumMeta.releaseDate || null
                    });
                }
            }

            if (restoredAlbums.length > 0) {
                setOverallRatedAlbums(restoredAlbums);
                // Save back to user doc to avoid re-fetching next time
                const userDocRef = doc(db, "users", uid);
                await updateDoc(userDocRef, { overallRatedAlbums: restoredAlbums });
            }
        } catch (error) {
            console.error("Error restoring user ratings:", error);
        }
    };

    const loadUserData = async (uid) => {
        try {
            const userDocRef = doc(db, "users", uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.musicLists) setMusicLists(data.musicLists);
                if (data.overallRatedAlbums && data.overallRatedAlbums.length > 0) {
                    setOverallRatedAlbums(data.overallRatedAlbums);
                } else {
                    // Backfill if empty
                    await fetchUserRatings(uid);
                }
                if (data.recentlyPlayed) setRecentlyPlayed(data.recentlyPlayed);
                if (data.recentActivity) setRecentActivity(data.recentActivity);
                if (data.ratingMethod) setRatingMethod(data.ratingMethod);
            } else {
                // Initialize default doc
                await setDoc(userDocRef, {
                    musicLists,
                    overallRatedAlbums: [],
                    recentlyPlayed: [],
                    recentActivity: [],
                    ratingMethod: '1-10'
                }, { merge: true });
            }
        } catch (e) {
            console.error('Failed to load data from Firestore.', e);
        }
    };

    const saveData = async (field, value) => {
        if (!user) return;
        try {
            const userDocRef = doc(db, "users", user.uid);
            await updateDoc(userDocRef, {
                [field]: value
            });
        } catch (error) {
            console.error(`Error saving ${field}:`, error);
        }
    };

    const updateRatingMethod = async (method) => {
        setRatingMethod(method);
        await saveData('ratingMethod', method);
    };

    const addList = async (newList) => {
        const updatedLists = [...musicLists, newList];
        setMusicLists(updatedLists);
        await saveData('musicLists', updatedLists);
    };

    const deleteList = async (listId) => {
        const updatedLists = musicLists.filter((list) => list.id !== listId);
        setMusicLists(updatedLists);
        await saveData('musicLists', updatedLists);
    };

    const getAlbumsInList = (listId) => {
        if (listId === OVERALL_RATINGS_LIST_ID) {
            return overallRatedAlbums;
        }
        if (typeof listId === 'string' && listId.startsWith('YEAR_')) {
            const yearStr = listId.replace('YEAR_', '');
            return overallRatedAlbums.filter(album => {
                if (!album.releaseDate) return false;
                return album.releaseDate.startsWith(yearStr);
            });
        }
        const list = musicLists.find((l) => l.id === listId);
        return list ? list.albums : [];
    };

    const addAlbumToList = async (listId, album) => {
        const updatedLists = musicLists.map(list =>
            list.id === listId ? { ...list, albums: [...list.albums.filter(a => a.id !== album.id), album] } : list
        );
        setMusicLists(updatedLists);
        await saveData('musicLists', updatedLists);
    };

    const removeAlbumFromList = async (listId, albumId) => {
        const updatedLists = musicLists.map(list =>
            list.id === listId ? { ...list, albums: list.albums.filter(album => album.id !== albumId) } : list
        );
        setMusicLists(updatedLists);
        await saveData('musicLists', updatedLists);
    };

    const addToRecentlyPlayed = async (album) => {
        setRecentlyPlayed(prev => {
            const filteredList = prev.filter(a => a.id?.toString() !== album.id?.toString());
            const updatedList = [album, ...filteredList].slice(0, 10);
            saveData('recentlyPlayed', updatedList);
            return updatedList;
        });
    };

    const addToRecentActivity = async (item) => {
        setRecentActivity(prev => {
            const filteredList = prev.filter(a => a.id?.toString() !== item.id?.toString());
            const updatedList = [item, ...filteredList].slice(0, 20);
            saveData('recentActivity', updatedList);
            return updatedList;
        });
    };

    const submitRating = async (albumId, ratingType, score, breakdown = null, albumMetadata = {}) => {
        if (!user) return;

        const validScore = parseFloat(score);
        if (isNaN(validScore)) return;

        // Normalize Type
        let dbType = ratingType;
        if (ratingType === '1-10') dbType = 'classic';
        else if (ratingType === '1-5') dbType = 'pizza';
        else if (ratingType === 'Percentage') dbType = 'percentage';
        else if (ratingType === 'Awards') dbType = 'awards';

        // 1. Optimistic UI Update (Local)
        updateOverallRatings(albumId, validScore, albumMetadata);

        try {
            // 2. Save User's Individual Rating (Private Profile)
            const userRatingRef = doc(db, "users", user.uid, "album_ratings", albumId.toString());
            await setDoc(userRatingRef, {
                type: dbType,
                originalType: ratingType,
                score: validScore,
                breakdown: breakdown || {},
                timestamp: new Date()
            });

            // 3. Save to Public Album Subcollection (for Aggregation)
            const publicRatingRef = doc(db, "albums", albumId.toString(), "user_ratings", user.uid);
            await setDoc(publicRatingRef, {
                type: dbType,
                score: validScore,
                userId: user.uid,
                timestamp: new Date()
            });

            // 4. Recalculate Global Stats (Read-All approach)
            const ratingsCollection = collection(db, "albums", albumId.toString(), "user_ratings");
            const snapshot = await getDocs(ratingsCollection);

            const newStats = {
                classic: { count: 0, sum: 0, average: 0 },
                pizza: { count: 0, sum: 0, average: 0 },
                percentage: { count: 0, sum: 0, average: 0 },
                awards: { count: 0, sum: 0, average: 0 },
                thumbs: { count: 0, sum: 0, average: 0 }
            };

            snapshot.forEach(doc => {
                const r = doc.data();
                let t = r.type;

                if (t && newStats[t]) {
                    newStats[t].count += 1;
                    newStats[t].sum += r.score;
                }
            });

            Object.keys(newStats).forEach(key => {
                if (newStats[key].count > 0) {
                    newStats[key].average = newStats[key].sum / newStats[key].count;
                }
            });

            // Write back to album doc
            const albumRef = doc(db, "albums", albumId.toString());
            await setDoc(albumRef, {
                name: albumMetadata.attributes?.name || albumMetadata.name || "Unknown",
                artistName: albumMetadata.attributes?.artistName || albumMetadata.artistName || "Unknown",
                artwork: albumMetadata.attributes?.artwork || albumMetadata.artwork || null,
                stats: newStats
            }, { merge: true });

            // 5. Auto-Remove from Listen Later (ID: 2) if present
            const listenLaterList = musicLists.find(l => l.id === 2);
            if (listenLaterList && listenLaterList.albums.some(a => a.id === albumId)) {
                await removeAlbumFromList(2, albumId);
                console.log(`Auto-removed album ${albumId} from Listen Later`);
            }

        } catch (error) {
            console.error("Error submitting rating using submitRating:", error);
        }
    };

    const updateOverallRatings = async (albumId, newRating, albumInfo) => {
        setOverallRatedAlbums(prevRatedAlbums => {
            const albumIndex = prevRatedAlbums.findIndex(a => a.id === albumId);
            let updatedRatedAlbums;

            const albumData = {
                id: albumId,
                name: albumInfo?.attributes?.name || albumInfo?.name || 'Unknown Album',
                artistName: albumInfo?.attributes?.artistName || albumInfo?.artistName || 'Unknown Artist',
                artwork: albumInfo?.attributes?.artwork || albumInfo?.artwork || null,
                userOverallRating: newRating,
                releaseDate: albumInfo?.attributes?.releaseDate || albumInfo?.releaseDate,
            };

            if (albumIndex > -1) {
                updatedRatedAlbums = prevRatedAlbums.map((album, index) =>
                    index === albumIndex ? { ...album, ...albumData } : album
                );
            } else {
                updatedRatedAlbums = [albumData, ...prevRatedAlbums];
            }

            saveData('overallRatedAlbums', updatedRatedAlbums);
            return updatedRatedAlbums;
        });
    };

    const value = useMemo(() => ({
        musicLists,
        overallRatedAlbums,
        recentlyPlayed,
        recentActivity,
        ratingMethod,
        setRatingMethod: updateRatingMethod,
        submitRating,
        addList,
        deleteList,
        getAlbumsInList,
        addAlbumToList,
        removeAlbumFromList,
        addToRecentlyPlayed,
        addToRecentActivity,
        updateOverallRatings,
    }), [musicLists, overallRatedAlbums, recentlyPlayed, recentActivity, ratingMethod]);

    return (
        <MusicContext.Provider value={value}>
            {children}
        </MusicContext.Provider>
    );
};
