import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ScrollView, Dimensions, SafeAreaView, Platform, StatusBar, Modal, TextInput, KeyboardAvoidingView, Alert, ActivityIndicator, Animated, PanResponder } from 'react-native';
import { MusicContext } from '../context/MusicContext';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { getTopCharts, getNewReleases, formatArtworkUrl, getTimeCapsuleRecommendation, searchMusic } from '../api/MusicService';

const SCREEN_WIDTH = Dimensions.get('window').width;

const HomeScreenMusic = () => {
    const { getAlbumsInList, recentlyPlayed, recentActivity, overallRatedAlbums, ratingMethod, setRatingMethod } = useContext(MusicContext);
    const navigation = useNavigation();

    const [userProfile, setUserProfile] = useState(null);
    const [topCharts, setTopCharts] = useState([]);
    const [newReleases, setNewReleases] = useState([]);
    const [showIntroModal, setShowIntroModal] = useState(false);

    const handleDismissIntro = async () => {
        setShowIntroModal(false);
        if (auth.currentUser) {
            try {
                await updateDoc(doc(db, "users", auth.currentUser.uid), {
                    hasSeenProfileIntroV2: true
                });
            } catch (e) {
                console.error("Error updating intro flag:", e);
            }
        }
    };

    const handleGoToProfileSetup = async () => {
        await handleDismissIntro();
        navigation.navigate('ProfileSettings');
    };

    const handleGenerateCapsule = async () => {
        if (!selectedYear || selectedYear.length !== 4) return;
        setIsGenerating(true);
        try {
            const result = await getTimeCapsuleRecommendation(parseInt(selectedYear));
            setGeneratedCapsule(result);
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const closeTimeCapsule = () => {
        setShowTimeCapsuleModal(false);
        setGeneratedCapsule(null);
        setSelectedYear('');
    };

    // Derived from Firestore profile data
    let top8 = [];
    if (userProfile?.topAlbums) {
        if (Array.isArray(userProfile.topAlbums)) {
            top8 = userProfile.topAlbums;
        } else if (typeof userProfile.topAlbums === 'string') {
            try {
                top8 = JSON.parse(userProfile.topAlbums);
            } catch (e) {
                console.error("Error parsing top albums:", e);
            }
        }
    }

    // Top 10 of Year
    const currentYear = new Date().getFullYear();
    const top10OfYear = useMemo(() => {
        if (!overallRatedAlbums) return [];
        return overallRatedAlbums
            .filter(album => album.releaseDate && album.releaseDate.startsWith(currentYear.toString()))
            .sort((a, b) => (b.userOverallRating || 0) - (a.userOverallRating || 0))
            .slice(0, 10)
            .map(album => ({
                ...album,
                userRating: album.userOverallRating, // explicitly set for badge
                ratingMethod: userProfile?.ratingMethod || '1-10' // Needed for emoji
            }));
    }, [overallRatedAlbums, currentYear, userProfile]);

    const hydratedRecentlyPlayed = useMemo(() => {
        if (!recentlyPlayed) return [];
        return recentlyPlayed.map(album => {
            const ratedVersion = overallRatedAlbums.find(ra => String(ra.id) === String(album.id));
            return {
                ...album,
                userRating: ratedVersion ? ratedVersion.userOverallRating : undefined,
                ratingMethod: userProfile?.ratingMethod || '1-10'
            };
        });
    }, [recentlyPlayed, overallRatedAlbums, userProfile]);

    const hydratedRecentActivity = useMemo(() => {
        if (!recentActivity) return [];
        return recentActivity.map(album => {
            const ratedVersion = overallRatedAlbums.find(ra => String(ra.id) === String(album.id));
            return {
                ...album,
                userRating: ratedVersion ? ratedVersion.userOverallRating : undefined,
                ratingMethod: userProfile?.ratingMethod || '1-10'
            };
        });
    }, [recentActivity, overallRatedAlbums, userProfile]);

    // Hydrated Top Friends (Fresh Data)
    const [hydratedTopFriends, setHydratedTopFriends] = useState([]);

    // Top 8 Edit State
    const [isEditTop8ModalVisible, setIsEditTop8ModalVisible] = useState(false);
    const [musicSearchQuery, setMusicSearchQuery] = useState('');
    const [musicSearchResults, setMusicSearchResults] = useState([]);
    const [isMusicSearching, setIsMusicSearching] = useState(false);
    const musicSearchTimeoutRef = useRef(null);

    // Rating style selection
    const [isRatingStyleModalVisible, setIsRatingStyleModalVisible] = useState(false);

    const changeRatingStyle = async (method) => {
        if (setRatingMethod) {
            setRatingMethod(method);
        }
        const user = auth.currentUser;
        if (user) {
            try {
                await updateDoc(doc(db, "users", user.uid), {
                    ratingMethod: method,
                    ratingSystem: method
                });
                setUserProfile(prev => prev ? { ...prev, ratingMethod: method, ratingSystem: method } : null);
            } catch (e) {
                console.error("Error syncing rating system to firestore:", e);
            }
        }
    };

    // Recommendations state
    const [recommendations, setRecommendations] = useState([]);
    const [isRecsLoading, setIsRecsLoading] = useState(false);

    const fetchAlbumsMetadata = async (albumIds) => {
        const uniqueIds = Array.from(new Set(albumIds)).filter(Boolean);
        if (uniqueIds.length === 0) return {};

        const batches = [];
        for (let i = 0; i < uniqueIds.length; i += 30) {
            batches.push(uniqueIds.slice(i, i + 30));
        }

        const albumMetadataMap = {};
        try {
            const promises = batches.map(async (batch) => {
                const q = query(collection(db, "albums"), where("__name__", "in", batch));
                const snap = await getDocs(q);
                snap.forEach(doc => {
                    albumMetadataMap[doc.id] = {
                        id: doc.id,
                        ...doc.data()
                    };
                });
            });
            await Promise.all(promises);
        } catch (e) {
            console.error("Error batch fetching album metadata:", e);
        }
        return albumMetadataMap;
    };

    useEffect(() => {
        const loadRecommendations = async () => {
            const userId = auth.currentUser?.uid;
            if (!userId) return;

            setIsRecsLoading(true);
            try {
                // 1. Fetch all ratings
                const ratingsRef = collectionGroup(db, "album_ratings");
                const ratingsSnap = await getDocs(ratingsRef);

                const ratingsByUser = {};
                ratingsSnap.forEach((docSnap) => {
                    const data = docSnap.data();
                    const pathParts = docSnap.ref.path.split('/');
                    const rUserId = pathParts[1];
                    const albumId = docSnap.id;

                    if (!ratingsByUser[rUserId]) {
                        ratingsByUser[rUserId] = [];
                    }
                    ratingsByUser[rUserId].push({
                        albumId,
                        score: data.score,
                        type: data.type || data.originalType || 'classic'
                    });
                });

                const getNormalizedScore = (score, type) => {
                    const t = String(type).toLowerCase();
                    if (t === 'pizza' || t === '1-5') return score / 5;
                    if (t === 'percentage' || t === '1-100') return score / 100;
                    return score / 10;
                };

                const lovedAlbumsByUser = {};
                Object.keys(ratingsByUser).forEach((uId) => {
                    const userRatings = ratingsByUser[uId];
                    const normalized = userRatings.map(r => ({
                        albumId: r.albumId,
                        normalizedScore: getNormalizedScore(r.score, r.type)
                    }));

                    const highlyRated = normalized.filter(r => r.normalizedScore >= 0.70);
                    if (highlyRated.length === 0) return;

                    highlyRated.sort((a, b) => b.normalizedScore - a.normalizedScore);

                    const limit = Math.max(3, Math.ceil(highlyRated.length * 0.25));
                    lovedAlbumsByUser[uId] = highlyRated.slice(0, limit).map(r => r.albumId);
                });

                const currentUserLoved = lovedAlbumsByUser[userId] || [];
                const currentUserRatedIds = overallRatedAlbums.map(a => String(a.id));
                const allLovedIds = new Set(currentUserLoved);

                const userFavoriteGenres = {};
                if (currentUserRatedIds.length > 0) {
                    const ratedAlbumsMetadata = await fetchAlbumsMetadata(currentUserRatedIds);
                    currentUserRatedIds.forEach(id => {
                        const albumMeta = ratedAlbumsMetadata[id];
                        if (albumMeta && albumMeta.genreNames) {
                            const isLoved = allLovedIds.has(id);
                            const weight = isLoved ? 2 : 1;
                            albumMeta.genreNames.forEach(genre => {
                                userFavoriteGenres[genre] = (userFavoriteGenres[genre] || 0) + weight;
                            });
                        }
                    });
                }

                // 2. Calculate User Similarity
                const userSimilarity = {};
                Object.keys(lovedAlbumsByUser).forEach((uId) => {
                    if (uId === userId) return;
                    
                    const otherLoved = lovedAlbumsByUser[uId];
                    const overlap = otherLoved.filter(albumId => allLovedIds.has(albumId));
                    if (overlap.length > 0) {
                        userSimilarity[uId] = overlap.length;
                    }
                });

                // 3. Compile Candidates
                const candidates = {};
                Object.keys(userSimilarity).forEach((uId) => {
                    const similarity = userSimilarity[uId];
                    const otherLoved = lovedAlbumsByUser[uId];
                    
                    otherLoved.forEach((albumId) => {
                        if (currentUserRatedIds.includes(String(albumId))) return;

                        if (!candidates[albumId]) {
                            candidates[albumId] = 0;
                        }
                        candidates[albumId] += similarity;
                    });
                });

                let candidateIds = Object.keys(candidates);
                let finalRecommendations = [];

                if (candidateIds.length > 0) {
                    const candidateMetadata = await fetchAlbumsMetadata(candidateIds);
                    const scoredCandidates = [];
                    candidateIds.forEach(albumId => {
                        const metadata = candidateMetadata[albumId];
                        if (!metadata) return;

                        const baseScore = candidates[albumId];
                        let genreBoost = 0;
                        if (metadata.genreNames) {
                            metadata.genreNames.forEach(genre => {
                                if (userFavoriteGenres[genre]) {
                                    genreBoost += userFavoriteGenres[genre];
                                }
                            });
                        }

                        const finalScore = baseScore * (1 + 0.3 * genreBoost);
                        scoredCandidates.push({
                            id: albumId,
                            score: finalScore,
                            ...metadata
                        });
                    });

                    scoredCandidates.sort((a, b) => b.score - a.score);
                    finalRecommendations = scoredCandidates.slice(0, 10);
                }

                // 4. Fallback if no overlap found
                if (finalRecommendations.length === 0) {
                    const popularCandidates = {};
                    Object.keys(lovedAlbumsByUser).forEach((uId) => {
                        if (uId === userId) return;
                        lovedAlbumsByUser[uId].forEach(albumId => {
                            if (currentUserRatedIds.includes(String(albumId))) return;
                            popularCandidates[albumId] = (popularCandidates[albumId] || 0) + 1;
                        });
                    });

                    let popularIds = Object.keys(popularCandidates);
                    if (popularIds.length > 0) {
                        const popularMetadata = await fetchAlbumsMetadata(popularIds);
                        const scoredPopular = [];
                        popularIds.forEach(albumId => {
                            const metadata = popularMetadata[albumId];
                            if (!metadata) return;

                            const baseScore = popularCandidates[albumId];
                            let genreBoost = 0;
                            if (metadata.genreNames) {
                                metadata.genreNames.forEach(genre => {
                                    if (userFavoriteGenres[genre]) {
                                        genreBoost += userFavoriteGenres[genre];
                                    }
                                });
                            }

                            const finalScore = baseScore * (1 + 0.3 * genreBoost);
                            scoredPopular.push({
                                id: albumId,
                                score: finalScore,
                                ...metadata
                            });
                        });

                        scoredPopular.sort((a, b) => b.score - a.score);
                        finalRecommendations = scoredPopular.slice(0, 10);
                    }
                }

                setRecommendations(finalRecommendations);
            } catch (error) {
                console.error("Error loading recommendations:", error);
            } finally {
                setIsRecsLoading(false);
            }
        };

        loadRecommendations();
    }, [overallRatedAlbums, userProfile?.uid]);

    // Drag-and-drop state & refs
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [activeTargetSlot, setActiveTargetSlot] = useState(null);
    const draggedIndexRef = useRef(null);
    const activeTargetSlotRef = useRef(null);
    const slotLayouts = useRef([]);
    const pan = useRef(new Animated.ValueXY()).current;

    const top8Ref = useRef(top8);
    useEffect(() => {
        top8Ref.current = top8;
    }, [top8]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: () => draggedIndexRef.current !== null,
            onPanResponderMove: (evt, gestureState) => {
                if (draggedIndexRef.current === null) return;
                
                // Update animated translation value
                pan.setValue({ x: gestureState.dx, y: gestureState.dy });

                // Calculate which slot the dragged item's center is hovering over
                const index = draggedIndexRef.current;
                const startSlot = slotLayouts.current[index];
                if (startSlot) {
                    const centerX = startSlot.x + startSlot.width / 2 + gestureState.dx;
                    const centerY = startSlot.y + startSlot.height / 2 + gestureState.dy;

                    let targetIndex = null;
                    for (let i = 0; i < 8; i++) {
                        const slot = slotLayouts.current[i];
                        if (slot) {
                            if (centerX >= slot.x && centerX <= slot.x + slot.width &&
                                centerY >= slot.y && centerY <= slot.y + slot.height) {
                                targetIndex = i;
                                break;
                            }
                        }
                    }
                    if (targetIndex !== activeTargetSlotRef.current) {
                        activeTargetSlotRef.current = targetIndex;
                        setActiveTargetSlot(targetIndex);
                    }
                }
            },
            onPanResponderRelease: async (evt, gestureState) => {
                const sourceIndex = draggedIndexRef.current;
                const targetIndex = activeTargetSlotRef.current;

                // Reset states
                draggedIndexRef.current = null;
                setDraggedIndex(null);
                activeTargetSlotRef.current = null;
                setActiveTargetSlot(null);
                pan.setValue({ x: 0, y: 0 });

                if (sourceIndex !== null && targetIndex !== null && sourceIndex !== targetIndex) {
                    const currentTop8 = top8Ref.current || [];
                    const padded = [...currentTop8].slice(0, 8);
                    while (padded.length < 8) {
                        padded.push({ id: `empty-${padded.length}`, isEmpty: true });
                    }

                    // Swap source and target items
                    const temp = padded[sourceIndex];
                    padded[sourceIndex] = padded[targetIndex];
                    padded[targetIndex] = temp;

                    // Filter out empty placeholder slots
                    const newTop8 = padded.filter(item => !item.isEmpty);

                    const user = auth.currentUser;
                    if (user) {
                        try {
                            await updateDoc(doc(db, "users", user.uid), { topAlbums: newTop8 });
                        } catch (e) {
                            console.error("Error saving reordered albums:", e);
                            Alert.alert("Error", "Could not save reordered albums.");
                        }
                    }
                }
            },
            onPanResponderTerminate: () => {
                draggedIndexRef.current = null;
                setDraggedIndex(null);
                activeTargetSlotRef.current = null;
                setActiveTargetSlot(null);
                pan.setValue({ x: 0, y: 0 });
            }
        })
    ).current;

    const searchMusicHandler = (query) => {
        setMusicSearchQuery(query);

        if (musicSearchTimeoutRef.current) {
            clearTimeout(musicSearchTimeoutRef.current);
        }

        if (!query) {
            setMusicSearchResults([]);
            setIsMusicSearching(false);
            return;
        }

        setIsMusicSearching(true);
        musicSearchTimeoutRef.current = setTimeout(async () => {
            try {
                const data = await searchMusic(query);
                const filtered = data.filter(item => item.type === 'albums');
                setMusicSearchResults(filtered);
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error(error);
            } finally {
                setIsMusicSearching(false);
            }
        }, 500);
    };

    const addTopAlbum = async (album) => {
        const user = auth.currentUser;
        if (!user) return;

        if (top8.length >= 8) {
            Alert.alert("Limit Reached", "You can only select your Top 8 albums.");
            return;
        }
        if (top8.some(a => String(a.id) === String(album.id))) {
            Alert.alert("Duplicate", "This album is already in your Top 8.");
            return;
        }

        const minimalAlbum = {
            id: album.id,
            name: album.attributes.name,
            artistName: album.attributes.artistName,
            artwork: album.attributes.artwork
        };

        const updatedAlbums = [...top8, minimalAlbum];
        try {
            await updateDoc(doc(db, "users", user.uid), { topAlbums: updatedAlbums });
            setMusicSearchQuery('');
            setMusicSearchResults([]);
            setIsMusicSearching(false);
            setDraggedIndex(null);
            draggedIndexRef.current = null;
            setActiveTargetSlot(null);
            activeTargetSlotRef.current = null;
        } catch (e) {
            console.error("Error adding top album:", e);
            Alert.alert("Error", "Could not save album to Top 8.");
        }
    };

    const removeTopAlbum = async (id) => {
        const user = auth.currentUser;
        if (!user) return;

        const updatedAlbums = top8.filter(a => String(a.id) !== String(id));
        try {
            await updateDoc(doc(db, "users", user.uid), { topAlbums: updatedAlbums });
        } catch (e) {
            console.error("Error removing top album:", e);
            Alert.alert("Error", "Could not remove album.");
        }
    };

    const [isFriendModalVisible, setIsFriendModalVisible] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [friendSearchResults, setFriendSearchResults] = useState([]);

    const searchUsers = async (text) => {
        setFriendSearchQuery(text);
        if (text.length < 1) {
            setFriendSearchResults(userProfile?.following || []);
            return;
        }
        const searchTerm = text.toLowerCase();
        try {
            const usersRef = collection(db, "users");
            const q1 = query(usersRef, where("username_lowercase", ">=", searchTerm), where("username_lowercase", "<=", searchTerm + '\uf8ff'));
            const q2 = query(usersRef, where("name_lowercase", ">=", searchTerm), where("name_lowercase", "<=", searchTerm + '\uf8ff'));

            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            const usersMap = new Map();
            snap1.forEach((doc) => { if (doc.id !== auth.currentUser.uid) usersMap.set(doc.id, { uid: doc.id, ...doc.data() }); });
            snap2.forEach((doc) => { if (doc.id !== auth.currentUser.uid) usersMap.set(doc.id, { uid: doc.id, ...doc.data() }); });

            setFriendSearchResults(Array.from(usersMap.values()));
        } catch (e) { console.error(e); }
    };

    const followUser = async (targetUser) => {
        const user = auth.currentUser;
        if (!user) return;
        
        const followingList = userProfile?.following || [];
        if (followingList.find(u => u.uid === targetUser.uid)) return;

        const newFollowingItem = { 
            uid: targetUser.uid, 
            username: targetUser.username || 'User', 
            profilePhoto: targetUser.profilePhoto || null 
        };

        try {
            await updateDoc(doc(db, "users", user.uid), { following: arrayUnion(newFollowingItem) });
            await updateDoc(doc(db, "users", targetUser.uid), { 
                followers: arrayUnion({ 
                    uid: user.uid, 
                    username: userProfile?.username || 'User', 
                    profilePhoto: userProfile?.profilePhoto || null 
                }) 
            });
        } catch (e) {
            console.error("Error following user:", e);
            Alert.alert("Error", "Could not follow user.");
        }
    };

    const toggleTopFriend = async (friend) => {
        const user = auth.currentUser;
        if (!user) return;

        const currentTopFriends = userProfile?.topFriends || [];
        const isAlreadyTop = currentTopFriends.some(f => f.uid === friend.uid);

        try {
            if (isAlreadyTop) {
                const updatedTopFriends = currentTopFriends.filter(f => f.uid !== friend.uid);
                await updateDoc(doc(db, "users", user.uid), { topFriends: updatedTopFriends });
            } else {
                if (currentTopFriends.length >= 4) {
                    Alert.alert("Top 4 Full", "Remove someone first to add a new top friend.");
                    return;
                }
                const newFriendItem = {
                    uid: friend.uid,
                    username: friend.username || 'User',
                    profilePhoto: friend.profilePhoto || null
                };
                await updateDoc(doc(db, "users", user.uid), { topFriends: [...currentTopFriends, newFriendItem] });
            }
        } catch (e) {
            console.error("Error updating top friends:", e);
            Alert.alert("Error", "Could not update Top 4 Friends.");
        }
    };

    // Load Profile Data Real-time
    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data());
                if (docSnap.data().hasSeenProfileIntroV2 === undefined || docSnap.data().hasSeenProfileIntroV2 === false) {
                    setShowIntroModal(true);
                }
            }
        });
        return () => unsub();
    }, []);

    // Hydrate Top Friends (Fetch latest photos)
    useEffect(() => {
        const fetchFriendsData = async () => {
            if (userProfile?.topFriends && userProfile.topFriends.length > 0) {
                const friendPromises = userProfile.topFriends.map(async (f) => {
                    try {
                        const friendSnap = await getDoc(doc(db, "users", f.uid));
                        if (friendSnap.exists()) {
                            return { ...f, ...friendSnap.data(), uid: f.uid };
                        }
                        return f;
                    } catch (e) {
                        return f;
                    }
                });
                const freshFriends = await Promise.all(friendPromises);
                setHydratedTopFriends(freshFriends);
            } else {
                setHydratedTopFriends([]);
            }
        };
        fetchFriendsData();
    }, [userProfile?.topFriends]);

    // Load Charts
    useEffect(() => {
        const loadMusicData = async () => {
            try {
                const [charts, releases] = await Promise.all([getTopCharts(), getNewReleases()]);
                setTopCharts(charts);
                setNewReleases(releases);
            } catch (err) {
                console.error("Error loading music data:", err);
            }
        };
        loadMusicData();
    }, []);

    const renderRatingBadge = (item) => {
        if (!item.userRating && item.userRating !== 0) return null;

        const rating = parseFloat(item.userRating);
        const method = item.ratingMethod;

        let displayValue = "";
        let iconName = "";
        let iconColor = "";
        let Component = null;

        if (method === 'Percentage' || method === 'percentage') {
            displayValue = rating % 1 === 0 ? `${rating}%` : `${rating.toFixed(1)}%`;
            iconName = "percent";
            iconColor = "#4CAF50";
            Component = Icon;
        } else if (method === '1-5' || method === 'Pizza' || method === 'pizza') {
            displayValue = `${rating.toFixed(1)}`;
            iconName = "pizza";
            iconColor = "#FF5722";
            Component = MaterialIcon;
        } else if (method === 'Awards' || method === 'awards') {
            displayValue = `${rating.toFixed(1)}`;
            iconName = "trophy";
            iconColor = "#FFD700";
            Component = Icon;
        } else if (method === 'Thumbs') {
            displayValue = `${rating.toFixed(1)}`;
            iconName = "thumb-up";
            iconColor = "#4CAF50";
            Component = MaterialIcon;
        } else {
            // Classic 1-10
            displayValue = `${rating.toFixed(1)}`;
            if (rating === 10) {
                return (
                    <View style={styles.ratingBadge}>
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFC107', justifyContent: 'center', alignItems: 'center', marginRight: 2 }}>
                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#000' }}>10</Text>
                        </View>
                        <Text style={styles.ratingBadgeText}>{displayValue}</Text>
                    </View>
                );
            }
        }

        return (
            <View style={styles.ratingBadge}>
                {Component && <Component name={iconName} size={10} color={iconColor} style={{ marginRight: 2 }} />}
                <Text style={styles.ratingBadgeText}>{displayValue}</Text>
            </View>
        );
    };

    const renderAlbumItem = ({ item }) => {
        const imageUrl = item.attributes?.artwork?.url
            ? formatArtworkUrl(item.attributes.artwork.url, 300, 300)
            : item.artwork?.url
                ? formatArtworkUrl(item.artwork.url, 300, 300)
                : 'https://via.placeholder.com/150';

        return (
            <TouchableOpacity
                style={styles.posterItem}
                onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
            >
                <Image source={{ uri: imageUrl }} style={styles.posterImage} />
                <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes?.name || item.name || item.title || 'Unknown'}</Text>
                <Text style={styles.artistName} numberOfLines={1}>{item.attributes?.artistName || item.artistName || 'Unknown Artist'}</Text>
                {renderRatingBadge(item)}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Intro Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={showIntroModal}
                onRequestClose={handleDismissIntro}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView contentContainerStyle={styles.modalScroll}>
                            <Text style={styles.modalTitle}>Welcome to TOMO</Text>
                            <Text style={styles.modalSubtitle}>Before you start rating music, let's set up your profile!</Text>

                            <View style={styles.instructionStep}>
                                <Text style={styles.stepTitle}>1. SET YOUR RATING STYLE (⚠️ IMPORTANT)</Text>
                                <Text style={styles.bulletText}>• This is crucial! Choose how you want to rate music (1-10, Pizza, Percentage, or Awards).</Text>
                            </View>

                            <View style={styles.instructionStep}>
                                <Text style={styles.stepTitle}>2. PICK YOUR TOP 8 ALBUMS</Text>
                                <Text style={styles.bulletText}>• Express your taste by featuring your top 8 favorite albums on your profile.</Text>
                            </View>

                            <View style={styles.instructionStep}>
                                <Text style={styles.stepTitle}>3. FIND FRIENDS</Text>
                                <Text style={styles.bulletText}>• Search for friends and follow them to see what they are listening to.</Text>
                            </View>
                        </ScrollView>

                        <TouchableOpacity style={styles.dismissButton} onPress={handleGoToProfileSetup}>
                            <Text style={styles.dismissButtonText}>Setup Profile Now</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={handleDismissIntro}>
                            <Text style={{ color: '#888', textDecorationLine: 'underline' }}>Skip for now</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>



            <ScrollView>
                <View style={styles.headerContainer}>
                    <View style={styles.profileSection}>
                        <View style={styles.avatarRow}>
                            {userProfile?.profilePhoto ? (
                                <Image source={{ uri: userProfile.profilePhoto }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatar, styles.placeholderAvatar]}>
                                    <Icon name="user" size={30} color="#fff" />
                                </View>
                            )}
                            <View style={styles.userInfo}>
                                <Text style={styles.userName} numberOfLines={1}>{userProfile?.name || 'Tomo User'}</Text>
                                <Text style={styles.userHandle}>@{userProfile?.username || 'username'}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginRight: 20 }}>
                                <TouchableOpacity 
                                    style={styles.editProfileBtn} 
                                    onPress={() => navigation.navigate('ProfileSettings')}
                                >
                                    <Text style={styles.editProfileBtnText}>Edit Profile</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={styles.pickRatingStyleBtn} 
                                    onPress={() => setIsRatingStyleModalVisible(true)}
                                >
                                    <Text style={styles.pickRatingStyleBtnText}>Pick Rating</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Bio */}
                        {userProfile?.bio ? (
                            <Text style={styles.bioText} numberOfLines={2}>{userProfile.bio}</Text>
                        ) : null}

                        {/* Social Stats */}
                        <View style={styles.statsContainer}>
                            <TouchableOpacity
                                style={styles.statItem}
                                onPress={() => navigation.navigate('FollowList', {
                                    title: 'Following',
                                    userList: userProfile?.following || [],
                                    currentUserId: auth.currentUser?.uid,
                                    isOwnFollowing: true
                                })}
                            >
                                <Text style={styles.statNumber}>{userProfile?.following?.length || 0}</Text>
                                <Text style={styles.statLabel}>Following</Text>
                            </TouchableOpacity>

                            <View style={styles.statDivider} />

                            <TouchableOpacity
                                style={styles.statItem}
                                onPress={() => navigation.navigate('FollowList', {
                                    title: 'Followers',
                                    userList: userProfile?.followers || [],
                                    currentUserId: auth.currentUser?.uid,
                                    isOwnFollowers: true
                                })}
                            >
                                <Text style={styles.statNumber}>{userProfile?.followers?.length || 0}</Text>
                                <Text style={styles.statLabel}>Followers</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View style={styles.separator} />

                {/* --- TOP 4 FRIENDS SECTION --- */}
                <View style={styles.sectionContainer}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                        <Text style={styles.sectionTitle}>Top 4 Friends</Text>
                        <TouchableOpacity 
                            style={styles.findFriendsBtn}
                            onPress={() => {
                                setFriendSearchQuery('');
                                setFriendSearchResults(userProfile?.following || []);
                                setIsFriendModalVisible(true);
                            }}
                        >
                            <Text style={styles.findFriendsBtnText}>FIND FRIENDS</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.topFriendsRow}>
                        {(() => {
                            const padded = [...hydratedTopFriends].slice(0, 4);
                            while (padded.length < 4) {
                                padded.push({ uid: `empty-${padded.length}`, isEmpty: true });
                            }
                            return padded.map((friend) => {
                                if (friend.isEmpty) {
                                    return (
                                        <View key={friend.uid} style={styles.topFriendItem}>
                                            <View style={[styles.topFriendImage, styles.emptyTopFriendSlot]}>
                                                <Icon name="plus" size={14} color="#666" />
                                            </View>
                                            <Text style={[styles.topFriendName, { color: '#666' }]}>Empty</Text>
                                        </View>
                                    );
                                }
                                return (
                                    <TouchableOpacity
                                        key={friend.uid}
                                        style={styles.topFriendItem}
                                        onPress={() => navigation.navigate('PublicProfile', { userId: friend.uid })}
                                    >
                                        <Image
                                            source={friend.profilePhoto ? { uri: friend.profilePhoto } : require('../assets/profile_placeholder.jpg')}
                                            style={styles.topFriendImage}
                                        />
                                        <Text style={styles.topFriendName} numberOfLines={1}>{friend.username}</Text>
                                    </TouchableOpacity>
                                );
                            });
                        })()}
                    </View>
                </View>



                {/* --- TOP 8 SECTION --- */}
                <View style={styles.sectionContainer}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                        <Text style={styles.sectionTitle}>My Top 8 Albums</Text>
                        <TouchableOpacity 
                            style={styles.findFriendsBtn}
                            onPress={() => {
                                setMusicSearchQuery('');
                                setMusicSearchResults([]);
                                setIsMusicSearching(false);
                                setDraggedIndex(null);
                                draggedIndexRef.current = null;
                                setActiveTargetSlot(null);
                                activeTargetSlotRef.current = null;
                                setIsEditTop8ModalVisible(true);
                            }}
                        >
                            <Text style={styles.findFriendsBtnText}>EDIT TOP 8</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.top8Grid}>
                        {(() => {
                            const padded = [...top8].slice(0, 8);
                            while (padded.length < 8) {
                                padded.push({ id: `empty-${padded.length}`, isEmpty: true });
                            }
                            return padded.map((album) => {
                                if (album.isEmpty) {
                                    return <View key={album.id} style={[styles.top8Item, styles.emptyTop8Slot]} />;
                                }
                                return (
                                    <TouchableOpacity
                                        key={album.id}
                                        style={styles.top8Item}
                                        onPress={() => navigation.navigate('AlbumDetails', { albumId: album.id, album: album })}
                                    >
                                        <Image
                                            source={{ uri: album.attributes?.artwork?.url ? formatArtworkUrl(album.attributes.artwork.url) : (album.artwork?.url ? formatArtworkUrl(album.artwork.url) : 'https://via.placeholder.com/150') }}
                                            style={styles.top8Image}
                                        />
                                    </TouchableOpacity>
                                );
                            });
                        })()}
                    </View>
                </View>

                <View style={styles.separator} />

                {/* --- TOP 10 OF YEAR SECTION --- */}
                <View style={styles.sectionContainer}>
                    <TouchableOpacity
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}
                        onPress={() => navigation.navigate('ListDetails', { listId: `YEAR_${currentYear}`, listName: `Top Albums of ${currentYear}` })}
                    >
                        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>My Top 10 Albums of {currentYear}</Text>
                        <Icon name="chevron-right" size={16} color="#000" />
                    </TouchableOpacity>

                    {top10OfYear.length > 0 ? (
                        <FlatList
                            horizontal
                            data={top10OfYear}
                            renderItem={renderAlbumItem}
                            keyExtractor={(item) => `top10-${item.id}`}
                            showsHorizontalScrollIndicator={false}
                        />
                    ) : (
                        <Text style={styles.emptyText}>Rate albums released in {currentYear} to see them here!</Text>
                    )}
                </View>

                <View style={styles.separator} />

                {/* --- RECENT ACTIVITY --- */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Recently Rated</Text>
                    <FlatList
                        horizontal
                        data={hydratedRecentActivity}
                        renderItem={renderAlbumItem}
                        keyExtractor={(item) => `activity-${item.id}`}
                        showsHorizontalScrollIndicator={false}
                        ListEmptyComponent={<Text style={styles.emptyText}>No recent activity.</Text>}
                    />
                </View>

                <View style={styles.separator} />

                {/* --- RECENTLY PLAYED --- */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Recently Played</Text>
                    <FlatList
                        horizontal
                        data={hydratedRecentlyPlayed}
                        renderItem={renderAlbumItem}
                        keyExtractor={(item) => `played-${item.id}`}
                        showsHorizontalScrollIndicator={false}
                        ListEmptyComponent={<Text style={styles.emptyText}>No albums marked as played.</Text>}
                    />
                </View>

                <View style={styles.separator} />

                {/* --- RECOMMENDED FOR YOU --- */}
                {recommendations.length > 0 && (
                    <>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>Recommended for You</Text>
                            <FlatList
                                horizontal
                                data={recommendations}
                                renderItem={renderAlbumItem}
                                keyExtractor={(item) => `rec-${item.id}`}
                                showsHorizontalScrollIndicator={false}
                            />
                        </View>
                        <View style={styles.separator} />
                    </>
                )}

                {/* --- TOP CHARTS --- */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Top Charts</Text>
                    <FlatList
                        horizontal
                        data={topCharts}
                        renderItem={renderAlbumItem}
                        keyExtractor={(item) => `chart-${item.id}`}
                        showsHorizontalScrollIndicator={false}
                    />
                </View>

                <View style={styles.separator} />

                {/* --- NEW RELEASES --- */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>New Releases</Text>
                    <FlatList
                        horizontal
                        data={newReleases}
                        renderItem={renderAlbumItem}
                        keyExtractor={(item) => `new-${item.id}`}
                        showsHorizontalScrollIndicator={false}
                    />
                </View>



                {/* --- APP DISCLAIMER --- */}
                <View style={styles.disclaimerContainer}>
                    <Text style={styles.disclaimerText}>
                        This product uses data provided by Apple Music & Custom Solutions, but is not endorsed or certified. TOMO Music is a music discovery and rating app. This app does not stream music and is not affiliated with or endorsed by any music corporation or streaming services.
                    </Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Friend Search Modal */}
            <Modal visible={isFriendModalVisible} animationType="slide" onRequestClose={() => setIsFriendModalVisible(false)}>
                <SafeAreaView style={styles.searchModalContainer}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                        <View style={styles.searchHeader}>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setIsFriendModalVisible(false)}>
                                <Icon name="chevron-left" size={24} color="#ff8c00" />
                            </TouchableOpacity>
                            <TextInput 
                                style={styles.searchInput} 
                                placeholder="Search users..." 
                                placeholderTextColor="#999" 
                                value={friendSearchQuery} 
                                onChangeText={searchUsers} 
                                autoFocus 
                            />
                        </View>
                        <FlatList
                            data={friendSearchResults}
                            keyExtractor={item => item.uid}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingBottom: 20 }}
                            renderItem={({ item }) => {
                                const isFollowing = (userProfile?.following || []).some(f => f.uid === item.uid);
                                const isTop = (userProfile?.topFriends || []).some(f => f.uid === item.uid);
                                return (
                                    <View style={styles.friendRow}>
                                        <TouchableOpacity 
                                            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} 
                                            onPress={() => {
                                                setIsFriendModalVisible(false);
                                                navigation.navigate('PublicProfile', { userId: item.uid });
                                            }}
                                        >
                                            <Image source={item.profilePhoto ? { uri: item.profilePhoto } : require('../assets/profile_placeholder.jpg')} style={styles.friendListImg} />
                                            <Text style={styles.friendListname}>{item.username}</Text>
                                        </TouchableOpacity>
                                        {!isFollowing && (
                                            <TouchableOpacity style={styles.followBtn} onPress={() => followUser(item)}>
                                                <Text style={{ color: '#D4AF37', fontWeight: 'bold' }}>Follow</Text>
                                            </TouchableOpacity>
                                        )}
                                        {isFollowing && (
                                            <TouchableOpacity 
                                                style={[styles.topFriendBtn, isTop && { backgroundColor: '#ff8c00' }]} 
                                                onPress={() => toggleTopFriend(item)}
                                            >
                                                <Text style={{ color: '#000' }}>{isTop ? 'In Top 4' : 'Add Top 4'}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            }}
                        />
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>

            {/* Edit Top 8 Modal */}
            <Modal visible={isEditTop8ModalVisible} animationType="slide" onRequestClose={() => setIsEditTop8ModalVisible(false)}>
                <SafeAreaView style={styles.searchModalContainer}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                        <View style={styles.searchHeader}>
                            <TouchableOpacity 
                                style={styles.closeButton} 
                                onPress={() => {
                                    setIsEditTop8ModalVisible(false);
                                    setMusicSearchQuery('');
                                    setMusicSearchResults([]);
                                    setIsMusicSearching(false);
                                    setDraggedIndex(null);
                                    draggedIndexRef.current = null;
                                    setActiveTargetSlot(null);
                                    activeTargetSlotRef.current = null;
                                    pan.setValue({ x: 0, y: 0 });
                                }}
                            >
                                <Icon name="chevron-left" size={24} color="#ff8c00" />
                            </TouchableOpacity>
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search albums to add..."
                                placeholderTextColor="#999"
                                value={musicSearchQuery}
                                onChangeText={searchMusicHandler}
                                autoFocus
                            />
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} scrollEnabled={draggedIndex === null}>
                            {/* Search Results (Shown at the top of the scrollview when search query is active) */}
                            {musicSearchQuery.trim() !== '' && (
                                <View style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                                    {isMusicSearching ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                                            <ActivityIndicator size="small" color="#D4AF37" style={{ marginRight: 10 }} />
                                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#555' }}>
                                                SEARCHING...
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 15 }}>
                                            {musicSearchResults.length > 0 ? 'SEARCH RESULTS' : 'NO RESULTS FOUND'}
                                        </Text>
                                    )}
                                    {musicSearchResults.map((item) => (
                                        <TouchableOpacity key={item.id} style={styles.searchItem} onPress={() => addTopAlbum(item)}>
                                            {item.attributes?.artwork ? (
                                                <Image source={{ uri: formatArtworkUrl(item.attributes.artwork.url, 100, 100) }} style={styles.searchPoster} />
                                            ) : (
                                                <View style={[styles.searchPoster, { backgroundColor: '#333' }]} />
                                            )}
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.searchTitle} numberOfLines={1}>{item.attributes?.name}</Text>
                                                <Text style={styles.searchSubtitle} numberOfLines={1}>{item.attributes?.artistName}</Text>
                                            </View>
                                            <Icon name="plus" size={14} color="#D4AF37" style={{ marginLeft: 10 }} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Current Top 8 Albums Grid (2 columns x 4 rows) */}
                            <View style={{ padding: 15 }}>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 15 }}>
                                    CURRENT TOP 8 ALBUMS ({top8.length}/8) (Hold Album to Reorder)
                                </Text>
                                <View style={[styles.editTop8Grid, { position: 'relative' }]} {...panResponder.panHandlers}>
                                    {(() => {
                                        const padded = [...top8].slice(0, 8);
                                        while (padded.length < 8) {
                                            padded.push({ id: `empty-${padded.length}`, isEmpty: true });
                                        }
                                        return padded.map((album, index) => {
                                            if (album.isEmpty) {
                                                return (
                                                    <View 
                                                        key={album.id} 
                                                        style={[
                                                            styles.editTop8GridItem, 
                                                            styles.editEmptyTop8Slot,
                                                            activeTargetSlot === index && { borderColor: '#D4AF37', borderWidth: 2, borderStyle: 'solid' }
                                                        ]}
                                                        onLayout={(e) => { slotLayouts.current[index] = e.nativeEvent.layout; }}
                                                    >
                                                        <Icon name="plus" size={24} color="#ccc" />
                                                    </View>
                                                );
                                            }
                                            return (
                                                <TouchableOpacity 
                                                    key={album.id} 
                                                    style={[
                                                        styles.editTop8GridItem,
                                                        activeTargetSlot === index && { borderColor: '#D4AF37', borderWidth: 2 },
                                                        draggedIndex === index && { opacity: 0.15 }
                                                    ]}
                                                    onLongPress={() => {
                                                        draggedIndexRef.current = index;
                                                        setDraggedIndex(index);
                                                        pan.setValue({ x: 0, y: 0 });
                                                    }}
                                                    delayLongPress={300}
                                                    activeOpacity={0.9}
                                                    onLayout={(e) => { slotLayouts.current[index] = e.nativeEvent.layout; }}
                                                >
                                                    {album.artwork ? (
                                                        <Image source={{ uri: formatArtworkUrl(album.artwork.url, 300, 300) }} style={styles.editTop8GridImage} />
                                                    ) : (
                                                        <View style={[styles.editTop8GridImage, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                                                            <Text style={{ color: '#fff', fontSize: 10 }}>No Art</Text>
                                                        </View>
                                                    )}
                                                    <TouchableOpacity style={styles.editRemoveBadge} onPress={() => removeTopAlbum(album.id)}>
                                                        <Icon name="times" size={12} color="#fff" />
                                                    </TouchableOpacity>
                                                </TouchableOpacity>
                                            );
                                        });
                                    })()}

                                    {/* Floating Dragged Item overlay */}
                                    {draggedIndex !== null && (() => {
                                        const padded = [...top8].slice(0, 8);
                                        while (padded.length < 8) {
                                            padded.push({ id: `empty-${padded.length}`, isEmpty: true });
                                        }
                                        const album = padded[draggedIndex];
                                        const startSlot = slotLayouts.current[draggedIndex];
                                        if (!album || album.isEmpty || !startSlot) return null;
                                        return (
                                            <Animated.View
                                                style={{
                                                    position: 'absolute',
                                                    left: startSlot.x,
                                                    top: startSlot.y,
                                                    width: startSlot.width,
                                                    height: startSlot.height,
                                                    transform: [
                                                        { translateX: pan.x },
                                                        { translateY: pan.y },
                                                        { scale: 1.08 }
                                                    ],
                                                    opacity: 0.85,
                                                    zIndex: 1000,
                                                    elevation: 5,
                                                    borderRadius: 8,
                                                    overflow: 'hidden',
                                                    backgroundColor: '#fff',
                                                }}
                                                pointerEvents="none"
                                            >
                                                {album.artwork ? (
                                                    <Image source={{ uri: formatArtworkUrl(album.artwork.url, 300, 300) }} style={styles.editTop8GridImage} />
                                                ) : (
                                                    <View style={[styles.editTop8GridImage, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                                                        <Text style={{ color: '#fff', fontSize: 10 }}>No Art</Text>
                                                    </View>
                                                )}
                                            </Animated.View>
                                        );
                                    })()}
                                </View>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>

            {/* Rating Style Picker Modal */}
            <Modal
                visible={isRatingStyleModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsRatingStyleModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Choose Rating Style</Text>
                        <Text style={[styles.modalSubtitle, { fontStyle: 'normal', textAlign: 'left', lineHeight: 20 }]}>
                            TOMO offers multiple ways to rate music & albums so you can express your opinion exactly how you want. Choose your preferred style below!
                        </Text>
                        
                        <View style={{ width: '100%', marginVertical: 10 }}>
                            {[
                                { 
                                    id: '1-10', 
                                    name: '1-10 (Classic)', 
                                    desc: 'The standard decimal rating. Rate albums on a scale of 1.0 to 10.0 for maximum precision.',
                                    icon: (
                                        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#D4AF37', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                            <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>10</Text>
                                        </View>
                                    )
                                },
                                { 
                                    id: '1-5', 
                                    name: 'Pizza Rating', 
                                    desc: 'A fun, casual scale from 1 to 5 slices. Because some albums are just "cheesy" good!',
                                    icon: <MaterialIcon name="pizza" size={30} color="#FF5722" style={{ marginRight: 12 }} />
                                },
                                { 
                                    id: 'Percentage', 
                                    name: 'Percentage', 
                                    desc: 'Rate from 0% to 100%. Perfect if you prefer a Rotten Tomatoes style metric.',
                                    icon: <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#4CAF50', marginRight: 12, width: 30, textAlign: 'center' }}>%</Text>
                                },
                                { 
                                    id: 'Awards', 
                                    name: 'Awards (Detailed)', 
                                    desc: 'For the critics! Rate specific categories like Sound, Lyrics, and Production. The overall score is calculated automatically.',
                                    icon: <Icon name="trophy" size={30} color="#D4AF37" style={{ marginRight: 12 }} />
                                }
                            ].map((item) => {
                                const isSelected = ratingMethod === item.id;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={[
                                            styles.styleOption,
                                            isSelected && styles.styleOptionSelected,
                                            { flexDirection: 'row', alignItems: 'center' }
                                        ]}
                                        onPress={() => {
                                            changeRatingStyle(item.id);
                                            setIsRatingStyleModalVisible(false);
                                        }}
                                    >
                                        {item.icon}
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={[
                                                    styles.styleOptionName,
                                                    isSelected && styles.styleOptionNameSelected
                                                ]}>
                                                    {item.name}
                                                </Text>
                                                {isSelected && <Icon name="check-circle" size={16} color="#D4AF37" style={{ marginLeft: 5 }} />}
                                            </View>
                                            <Text style={[
                                                styles.styleOptionDesc,
                                                isSelected && styles.styleOptionDescSelected
                                            ]}>
                                                {item.desc}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity 
                            style={styles.closeModalBtn}
                            onPress={() => setIsRatingStyleModalVisible(false)}
                        >
                            <Text style={styles.closeModalBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2', // Light Gray App Background
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    headerContainer: {
        flexDirection: 'row',
        padding: 15,
        backgroundColor: '#F2F2F2', // Match App Background
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomColor: '#E0E0E0', // Light separator
        flexDirection: 'column', // Changed to column to stack new sections
        alignItems: 'stretch'
    },
    profileSection: {
        flex: 1,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 12,
        borderWidth: 2,
        borderColor: '#C6A87C' // Metallic Gold
    },
    placeholderAvatar: {
        backgroundColor: '#DDD',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CCC'
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000', // Black text for Light Mode
    },
    userHandle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    editProfileBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: '#ccc',
        width: 95,
        paddingVertical: 5,
        borderRadius: 13,
        marginLeft: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editProfileBtnText: {
        color: '#666',
        fontWeight: 'bold',
        fontSize: 11.5,
        letterSpacing: 0
    },
    bioText: {
        fontSize: 13,
        color: '#555',
        marginTop: 10,
        fontStyle: 'italic',
        lineHeight: 18
    },
    statsContainer: {
        flexDirection: 'row',
        marginTop: 15,
        justifyContent: 'center', // Centered
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#EEE',
        paddingTop: 10
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15 // Add padding for touch target but rely on center
    },
    statNumber: {
        fontWeight: 'bold',
        fontSize: 14,
        marginRight: 5,
        color: '#000'
    },
    statLabel: {
        color: '#666',
        fontSize: 14
    },
    statDivider: {
        width: 1,
        height: 14,
        backgroundColor: '#CCC',
        marginHorizontal: 15 // Use horizontal margin instead of just right
    },
    topFriendsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between', // Spread evenly
        paddingHorizontal: 10 // Add some padding on edges
    },
    topFriendItem: {
        alignItems: 'center',
        width: '22%' // Close to 25% but leaves room for gap if needed. 
    },
    topFriendImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: '#D4AF37',
        marginBottom: 4
    },
    topFriendName: {
        fontSize: 10,
        color: '#000',
        textAlign: 'center'
    },
    emptyTopFriendSlot: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(0,0,0,0.3)',
        backgroundColor: 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    findFriendsBtn: {
        backgroundColor: '#000',
        width: 95,
        paddingVertical: 5,
        borderRadius: 13,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.5,
        elevation: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    findFriendsBtnText: {
        color: '#E5C585',
        fontWeight: 'bold',
        fontSize: 10.5,
        letterSpacing: 0,
    },
    searchModalContainer: { flex: 1, backgroundColor: '#F2F2F2' },
    searchHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 15, 
        borderBottomWidth: 1, 
        borderBottomColor: '#ddd', 
        marginTop: Platform.OS === 'ios' ? 20 : 15, 
        paddingTop: Platform.OS === 'android' ? 20 : 0, 
        backgroundColor: '#fff' 
    },
    closeButton: { paddingRight: 10, minWidth: 40, justifyContent: 'center', alignItems: 'center' },
    searchInput: { flex: 1, backgroundColor: '#F9F9F9', color: '#000', borderRadius: 8, padding: 10, fontSize: 16, marginLeft: 5, borderWidth: 1, borderColor: '#eee' },
    friendRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    friendListImg: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
    friendListname: { color: '#000', fontSize: 16, flex: 1 },
    followBtn: { backgroundColor: '#000', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
    topFriendBtn: { backgroundColor: '#F2F2F2', borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    separator: {
        height: 15,
        backgroundColor: '#F2F2F2',
    },
    sectionContainer: {
        padding: 20,
        backgroundColor: '#E5C585', // GOLD CARD IS BACK
        borderRadius: 16,
        marginHorizontal: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#C6A87C',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.15,
        shadowRadius: 4.65,
        elevation: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#000', // Black Font on Gold Card
        letterSpacing: 0.5,
        textTransform: 'uppercase'
    },
    top8Grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    top8Item: {
        width: '23%',
        aspectRatio: 1,
        marginBottom: '3%',
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.2)',
        backgroundColor: 'rgba(0,0,0,0.05)'
    },
    emptyTop8Slot: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(0,0,0,0.2)',
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    top8Image: {
        width: '100%',
        height: '100%',
    },
    posterItem: {
        marginRight: 15,
        width: 130
    },
    posterImage: {
        width: 130,
        height: 130, // Square
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)'
    },
    albumTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#000', // Black Font on Gold Card
        marginBottom: 4
    },
    artistName: {
        fontSize: 11,
        color: '#333' // Dark Gray Font
    },
    emptyText: {
        color: '#666',
        fontStyle: 'italic',
    },
    ratingBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.85)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#D4AF37' // Gold border
    },
    ratingBadgeText: {
        color: '#D4AF37', // Gold text
        fontSize: 10,
        fontWeight: 'bold'
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#121212',
        borderRadius: 20,
        maxHeight: '90%',
        padding: 25,
        borderWidth: 1,
        borderColor: '#C6A87C'
    },
    modalScroll: {
        paddingBottom: 20
    },
    modalTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#E5C585',
        textAlign: 'center',
        marginBottom: 5
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        marginBottom: 25,
        fontStyle: 'italic'
    },
    instructionStep: {
        marginBottom: 25,
        backgroundColor: '#1E1E1E',
        padding: 15,
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: '#D4AF37'
    },
    stepTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 8,
        letterSpacing: 1
    },
    bulletText: {
        fontSize: 13,
        color: '#BBB',
        marginBottom: 2
    },
    dismissButton: {
        backgroundColor: '#C6A87C', // Muted Gold Gradient sim
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: "#C6A87C",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    dismissButtonText: {
        color: '000',
        fontWeight: 'bold',
        fontSize: 16,
        letterSpacing: 1
    },
    // Time Capsule Banner
    timeCapsuleBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#d4a03e',
        marginHorizontal: 15,
        marginTop: 15,
        marginBottom: 5,
        padding: 15,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C6A87C',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    timeCapsuleContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timeCapsuleTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000',
    },
    timeCapsuleSubtitle: {
        fontSize: 12,
        color: '#333'
    },
    // Time Capsule Modal
    capsuleModalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 25,
        alignItems: 'center'
    },
    capsuleIconContainer: {
        marginBottom: 15
    },
    capsuleTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 5
    },
    capsuleSubtitle: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20
    },
    yearInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        width: '100%',
        padding: 15,
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 20,
        color: '#000',
        backgroundColor: '#F9F9F9'
    },
    generateButton: {
        backgroundColor: '#d4a03e',
        width: '100%',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 10
    },
    disabledButton: {
        opacity: 0.7
    },
    generateButtonText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16
    },
    closeCapsuleButton: {
        padding: 10
    },
    closeCapsuleText: {
        color: '#666',
        fontSize: 14
    },
    // Result
    capsuleResultTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#d4a03e',
        marginBottom: 15
    },
    capsuleImage: {
        width: 200,
        height: 200,
        borderRadius: 8,
        marginBottom: 15
    },
    capsuleAlbumName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
        textAlign: 'center',
        marginBottom: 5
    },
    capsuleArtistName: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20
    },
    capsuleActions: {
        width: '100%',
        marginBottom: 10
    },
    capsuleActionButton: {
        backgroundColor: '#000',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 10
    },
    capsuleActionText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    capsuleResetButton: {
        padding: 10,
        alignItems: 'center'
    },
    capsuleResetText: {
        color: '#d4a03e',
        fontWeight: '600'
    },
    disclaimerContainer: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
        alignItems: 'center',
    },
    disclaimerText: {
        fontSize: 10,
        color: '#999',
        textAlign: 'center',
        lineHeight: 14,
    },
    editTop8Item: {
        marginRight: 12,
        position: 'relative',
        paddingTop: 5,
        paddingRight: 5,
    },
    editTop8Grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    editTop8GridItem: {
        width: '48%',
        aspectRatio: 1,
        marginBottom: '4%',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#EAEAEA',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editEmptyTop8Slot: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#ccc',
        backgroundColor: '#F9F9F9',
    },
    editTop8GridImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    editRemoveBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: '#FF4444',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
        elevation: 2,
    },
    searchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        backgroundColor: '#fff',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#eee',
    },
    searchPoster: {
        width: 45,
        height: 45,
        borderRadius: 4,
        marginRight: 10,
    },
    searchTitle: {
        color: '#000',
        fontSize: 14,
        fontWeight: 'bold',
    },
    searchSubtitle: {
        color: '#555',
        fontSize: 12,
    },
    pickRatingStyleBtn: {
        marginTop: 6,
        marginLeft: 10,
        backgroundColor: '#D4AF37', // Gold
        width: 95,
        paddingVertical: 5,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    pickRatingStyleBtnText: {
        color: '#fff',
        fontSize: 11.5,
        fontWeight: 'bold',
        letterSpacing: 0,
    },
    styleOption: {
        backgroundColor: '#1E1E1E',
        padding: 15,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1.5,
        borderColor: '#333',
    },
    styleOptionSelected: {
        borderColor: '#D4AF37',
        backgroundColor: '#262218',
    },
    styleOptionName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFF',
    },
    styleOptionNameSelected: {
        color: '#D4AF37',
    },
    styleOptionDesc: {
        fontSize: 12,
        color: '#999',
        marginTop: 4,
    },
    styleOptionDescSelected: {
        color: '#CCC',
    },
    closeModalBtn: {
        backgroundColor: '#333',
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 15,
    },
    closeModalBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default HomeScreenMusic;
