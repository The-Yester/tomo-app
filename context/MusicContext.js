import React, { createContext, useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, runTransaction, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { getPhysicalCollection, addPhysicalAlbum, removePhysicalAlbum } from '../api/MusicService';

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
    submitRating: () => { },
    deleteRating: () => { },
    physicalCollection: [],
    addToPhysicalCollection: () => { },
    removeFromPhysicalCollection: () => { }
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
    const [physicalCollection, setPhysicalCollection] = useState([]);

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
                setPhysicalCollection([]);
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
                    let ratedAtVal = null;
                    if (ratingData.timestamp) {
                        if (typeof ratingData.timestamp.toDate === 'function') {
                            ratedAtVal = ratingData.timestamp.toDate().toISOString();
                        } else {
                            ratedAtVal = new Date(ratingData.timestamp).toISOString();
                        }
                    } else {
                        ratedAtVal = new Date().toISOString();
                    }

                    restoredAlbums.push({
                        id: albumId,
                        name: albumMeta.name || "Unknown",
                        artistName: albumMeta.artistName || "Unknown",
                        artwork: albumMeta.artwork || null,
                        userOverallRating: ratingData.score,
                        releaseDate: albumMeta.releaseDate || null,
                        ratedAt: ratedAtVal,
                        genreNames: albumMeta.genreNames || []
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

                // Fetch physical collection
                const physicalItems = await getPhysicalCollection(uid);
                setPhysicalCollection(physicalItems);
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

    const stripAlbumData = (album) => {
        if (!album) return null;
        return {
            id: album.id,
            name: album.name || album.attributes?.name || '',
            artistName: album.artistName || album.attributes?.artistName || '',
            artwork: album.artwork || album.attributes?.artwork || null,
            releaseDate: album.releaseDate || album.attributes?.releaseDate || null
        };
    };

    const addAlbumToList = async (listId, album) => {
        const strippedAlbum = stripAlbumData(album);
        if (!strippedAlbum) return;

        const updatedLists = musicLists.map(list =>
            list.id === listId ? { ...list, albums: [...list.albums.filter(a => a.id !== strippedAlbum.id), strippedAlbum] } : list
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
        const strippedAlbum = stripAlbumData(album);
        if (!strippedAlbum) return;

        setRecentlyPlayed(prev => {
            const filteredList = prev.filter(a => a.id?.toString() !== strippedAlbum.id?.toString());
            const updatedList = [strippedAlbum, ...filteredList].slice(0, 10);
            saveData('recentlyPlayed', updatedList);
            return updatedList;
        });
    };

    const addToRecentActivity = async (item) => {
        const strippedItem = stripAlbumData(item);
        if (!strippedItem) return;

        setRecentActivity(prev => {
            const filteredList = prev.filter(a => a.id?.toString() !== strippedItem.id?.toString());
            const updatedList = [strippedItem, ...filteredList].slice(0, 20);
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
                genreNames: albumMetadata.attributes?.genreNames || albumMetadata.genreNames || [],
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
            throw error;
        }
    };

    const deleteRating = async (albumId) => {
        if (!user) return;

        try {
            // 1. Delete User's Individual Rating (Private Profile)
            const userRatingRef = doc(db, "users", user.uid, "album_ratings", albumId.toString());
            await deleteDoc(userRatingRef);

            // 2. Delete from Public Album Subcollection (for Aggregation)
            const publicRatingRef = doc(db, "albums", albumId.toString(), "user_ratings", user.uid);
            await deleteDoc(publicRatingRef);

            // 3. Recalculate Global Stats
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

            // Write back updated stats to album doc
            const albumRef = doc(db, "albums", albumId.toString());
            await setDoc(albumRef, { stats: newStats }, { merge: true });

            // 4. Update Local State (Optimistic)
            setOverallRatedAlbums(prev => {
                const updatedList = prev.filter(a => a && a.id && String(a.id) !== String(albumId));
                saveData('overallRatedAlbums', updatedList);
                return updatedList;
            });

            // Clean up Recently Rated
            setRecentActivity(prev => {
                const updatedList = prev.filter(a => a && a.id && String(a.id) !== String(albumId));
                saveData('recentActivity', updatedList);
                return updatedList;
            });

            // Clean up Recently Played
            setRecentlyPlayed(prev => {
                const updatedList = prev.filter(a => a && a.id && String(a.id) !== String(albumId));
                saveData('recentlyPlayed', updatedList);
                return updatedList;
            });

        } catch (error) {
            console.error("Error deleting rating:", error);
            throw error;
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
                genreNames: albumInfo?.attributes?.genreNames || albumInfo?.genreNames || []
            };

            if (albumIndex > -1) {
                const existingAlbum = prevRatedAlbums[albumIndex];
                albumData.ratedAt = existingAlbum?.ratedAt || new Date().toISOString();
                updatedRatedAlbums = prevRatedAlbums.map((album, index) =>
                    index === albumIndex ? { ...album, ...albumData } : album
                );
            } else {
                albumData.ratedAt = new Date().toISOString();
                updatedRatedAlbums = [albumData, ...prevRatedAlbums];
            }

            saveData('overallRatedAlbums', updatedRatedAlbums);
            return updatedRatedAlbums;
        });
    };

    const addToPhysicalCollection = async (album, format) => {
        if (!user) return;

        // Optimistic UI update
        const newItem = {
            id: album.id,
            name: album.name || album.attributes?.name || '',
            artistName: album.artistName || album.attributes?.artistName || '',
            artwork: album.artwork || album.attributes?.artwork || null,
            format: format,
            addedAt: new Date(), // Mock date for immediate UI ordering
        };

        setPhysicalCollection(prev => [newItem, ...prev]);

        try {
            await addPhysicalAlbum(user.uid, album, format);
        } catch (error) {
            // Revert if failed
            setPhysicalCollection(prev => prev.filter(item => !(item.id === album.id && item.format === format)));
            console.error(error);
        }
    };

    const removeFromPhysicalCollection = async (albumId, format) => {
        if (!user) return;

        // Optimistic UI update
        setPhysicalCollection(prev => prev.filter(item => !(String(item.id) === String(albumId) && item.format === format)));

        try {
            await removePhysicalAlbum(user.uid, albumId, format);
        } catch (error) {
            // Re-fetch on failure to restore state
            const items = await getPhysicalCollection(user.uid);
            setPhysicalCollection(items);
            console.error(error);
        }
    };

    const value = useMemo(() => ({
        musicLists,
        overallRatedAlbums,
        recentlyPlayed,
        recentActivity,
        ratingMethod,
        setRatingMethod: updateRatingMethod,
        submitRating,
        deleteRating,
        addList,
        deleteList,
        getAlbumsInList,
        addAlbumToList,
        removeAlbumFromList,
        addToRecentlyPlayed,
        addToRecentActivity,
        updateOverallRatings,
        physicalCollection,
        addToPhysicalCollection,
        removeFromPhysicalCollection,
    }), [musicLists, overallRatedAlbums, recentlyPlayed, recentActivity, ratingMethod, physicalCollection]);

    return (
        <MusicContext.Provider value={value}>
            {children}
        </MusicContext.Provider>
    );
};
