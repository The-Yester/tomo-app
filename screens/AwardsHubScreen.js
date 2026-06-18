import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert, Platform, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { fetchActiveAwardsEvents, seedAwardsData, saveUserPick, fetchUserBallot } from '../api/AwardsService';
import { auth, db } from '../firebaseConfig';
import { collection, getDocs, collectionGroup } from 'firebase/firestore';
import { ADMIN_UIDS } from '../utils/config';

const AwardsHubScreen = () => {
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [allEvents, setAllEvents] = useState([]);
    const [event, setEvent] = useState(null); // Currently selected event
    const [userRatings, setUserRatings] = useState({}); // { movieId: { score, breakdown: {} } }

    const [userBallot, setUserBallot] = useState({}); // { categoryId: nomineeTmdbId }
    const [pickingProgress, setPickingProgress] = useState({ picked: 0, total: 0, correct: 0, decided: 0 });
    const [percentile, setPercentile] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    // Reload ballot and peer stats when event changes
    useEffect(() => {
        if (event && auth.currentUser) {
            loadBallot(event.id);
            // Only calculate percentile if there are results
            if (event.categories.some(c => c.winnerMusicId)) {
                loadPeerPerformance(event);
            } else {
                setPercentile(null);
            }
        }
    }, [event]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch All Active Events
            const events = await fetchActiveAwardsEvents();
            if (events.length > 0) {
                setAllEvents(events);
                setEvent(events[0]);
            } else {
                setAllEvents([]);
                setEvent(null);
            }

            // 2. Fetch User Ratings (All)
            if (auth.currentUser) {
                const ratingsRef = collection(db, "users", auth.currentUser.uid, "ratings");
                const snapshot = await getDocs(ratingsRef);
                const ratingsMap = {};
                snapshot.forEach(doc => {
                    ratingsMap[doc.id] = doc.data();
                });
                setUserRatings(ratingsMap);
            }

        } catch (error) {
            console.error("Awards Hub Load Error:", error);
            Alert.alert("Error", "Failed to load Awards Data");
        } finally {
            setLoading(false);
        }
    };


    const loadBallot = async (eventId) => {
        if (!auth.currentUser) return;
        const ballot = await fetchUserBallot(auth.currentUser.uid, eventId);
        setUserBallot(ballot || {});
    };

    // Calculate Percentile
    const loadPeerPerformance = async (currentEvent) => {
        try {
            // 1. Fetch all ballots for this event ID (across all users)
            const q = collectionGroup(db, 'awards_ballots');
            const querySnapshot = await getDocs(q);

            let allScores = [];

            // 2. Iterate and score each ballot
            querySnapshot.forEach((doc) => {
                if (doc.id === currentEvent.id) { // Filter by Event ID
                    const ballotData = doc.data();
                    let score = 0;
                    currentEvent.categories.forEach(cat => {
                        if (cat.winnerMusicId && ballotData[cat.id] === cat.winnerMusicId) {
                            score++;
                        }
                    });
                    allScores.push(score);
                }
            });

            if (allScores.length === 0) {
                setPercentile(null);
                return;
            }

            // 3. Calculate My Score
            let myScore = 0;
            currentEvent.categories.forEach(cat => {
                if (cat.winnerMusicId && userBallot[cat.id] === cat.winnerMusicId) {
                    myScore++;
                }
            });

            // 4. Calculate Percentile
            // Percentile = (Number of Scores <= My Score) / Total Scores * 100
            const countAtOrBelow = allScores.filter(s => s <= myScore).length;
            const percentileRank = (countAtOrBelow / allScores.length) * 100;

            setPercentile(Math.round(percentileRank));

        } catch (e) {
            console.error("Error calculating percentile:", e);
        }
    };

    // Calculate picks progress (Manual Picks count primarily)
    useEffect(() => {
        if (!event) return;
        let picked = Object.keys(userBallot).length;
        let total = event.categories.length;

        let correct = 0;
        let decided = 0;
        event.categories.forEach(cat => {
            if (cat.winnerMusicId) {
                decided++;
                if (userBallot[cat.id] === cat.winnerMusicId) correct++;
            }
        });

        setPickingProgress({ picked, total, correct, decided });
    }, [event, userBallot]);

    const calculateAnalyticalPick = (category) => {
        let bestNominee = null;
        let highestScore = -1;

        category.nominees.forEach(nominee => {
            const ratingStrings = userRatings[nominee.musicId.toString()];
            if (ratingStrings && ratingStrings.breakdown && ratingStrings.breakdown[category.awardsRatingKey]) {
                const score = parseFloat(ratingStrings.breakdown[category.awardsRatingKey]);
                if (score > highestScore) {
                    highestScore = score;
                    bestNominee = { ...nominee, score };
                }
            }
        });
        return bestNominee;
    };

    // Check if voting is closed (6 PM CST on Event Day)
    const isVotingClosed = () => {
        if (!event || !event.date) return false;

        // 0. Manual Override
        if (event.lockOverride === 'closed') return true;
        if (event.lockOverride === 'open') return false;

        // 1. Get Event Date parts in Chicago Time
        const eventDateObj = new Date(event.date.seconds * 1000);
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const parts = formatter.formatToParts(eventDateObj);
        const map = {};
        parts.forEach(p => map[p.type] = p.value);

        // 2. Construct ISO string for Event Day
        const eventIso = `${map.year}-${map.month}-${map.day}`;

        // 3. Get Current Time parts in Chicago Time
        const now = new Date();
        const nowParts = formatter.formatToParts(now);
        const nowMap = {};
        nowParts.forEach(p => nowMap[p.type] = p.value);
        const nowIso = `${nowMap.year}-${nowMap.month}-${nowMap.day}`;

        // 4. Get Current Hour in Chicago
        const hourFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            hour: 'numeric', hour12: false
        });
        const currentHour = parseInt(hourFormatter.format(now));

        // Logic
        if (nowIso > eventIso) return true; // Past the day
        if (nowIso === eventIso && currentHour >= 18) return true; // Same day, past 6 PM (18:00)

        return false;
    };

    const locked = isVotingClosed();

    const handleLockPick = async (category, nominee) => {
        if (!auth.currentUser || !event) return;
        if (locked) {
            Alert.alert("Voting Closed", "The polls closed at 6:00 PM CST.");
            return;
        }

        // Optimistic UI update
        const newBallot = { ...userBallot, [category.id]: nominee.musicId };
        setUserBallot(newBallot);

        try {
            await saveUserPick(auth.currentUser.uid, event.id, category.id, nominee.musicId);
        } catch (e) {
            Alert.alert("Error", "Failed to save pick");
        }
    };

    const handleSeed = async () => {
        setLoading(true);
        await seedAwardsData();
        await loadData();
        Alert.alert("Done", "Seeded Full 2026 Schedule");
        setLoading(false);
    };

    const navigateToMovie = (nominee) => {
        const movieObj = {
            id: nominee.musicId,
            title: nominee.title || nominee.name, // Use title if available, otherwise name (risky but better than nothing)
            poster_path: nominee.poster_path,
            release_date: "" // Awards Hub might not have release date handy, but that's ok
        };
        navigation.push('MovieDetails', { movieId: nominee.musicId, movie: movieObj });
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#e50914" />
                <Text style={styles.loadingText}>Analyzing your profile...</Text>
            </View>
        );
    }

    if (!event) {
        return (
            <View style={[styles.container, styles.center]}>
                <Icon name="trophy" size={50} color="#555" />
                <Text style={{ color: 'white', marginTop: 20 }}>No Active Awards Season Found.</Text>
                {ADMIN_UIDS.includes(auth.currentUser?.uid) && (
                    <TouchableOpacity onPress={handleSeed} style={styles.seedButton}>
                        <Text style={styles.seedText}>Setup 2026 Season (Admin)</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    }

    const formatDate = (seconds) => {
        if (!seconds) return "";
        const d = new Date(seconds * 1000);
        return d.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="chevron-left" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Awards Season Hub</Text>
                    <Text style={styles.headerSubtitle}>Prediction Ballot Game</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* EVENT SELECTOR TABS */}
            <View style={styles.tabsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
                    {allEvents.map((evt) => (
                        <TouchableOpacity
                            key={evt.id}
                            style={[styles.tabItem, event.id === evt.id && styles.tabItemActive]}
                            onPress={() => setEvent(evt)}
                        >
                            <Text style={[styles.tabText, event.id === evt.id && styles.tabTextActive]}>
                                {evt.name.replace("Awards", "").replace("Film", "").trim()}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Banner */}
                <View style={[styles.eventBanner, locked && { borderBottomColor: '#b00', borderBottomWidth: 2 }]}>
                    <Text style={styles.eventName}>{event.name}</Text>
                    <Text style={styles.eventDate}>{formatDate(event.date?.seconds)}</Text>

                    {/* Score Display (Split View) */}
                    {pickingProgress.decided > 0 && (
                        <View style={styles.resultsRow}>
                            {/* Left: Raw Score */}
                            <View style={[styles.scoreContainer, { flex: 1, marginRight: 5 }]}>
                                <Text style={styles.scoreLabel}>RESULTS</Text>
                                <Text style={styles.scoreValue}>{pickingProgress.correct} / {pickingProgress.decided}</Text>
                                <Text style={styles.scoreSubtext}>Correct Picks</Text>
                            </View>

                            {/* Right: Percentile */}
                            <View style={[styles.scoreContainer, { flex: 1, marginLeft: 5 }]}>
                                <Text style={styles.scoreLabel}>PERCENTILE</Text>
                                <Text style={styles.scoreValue}>{percentile !== null ? `${percentile}th` : '--'}</Text>
                                <Text style={styles.scoreSubtext}>Top {percentile !== null ? 100 - percentile : '--'}%</Text>
                            </View>
                        </View>
                    )}

                    {locked ? (
                        <View style={styles.lockedBanner}>
                            <Icon name="lock" size={16} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.lockedBannerText}>VOTING CLOSED</Text>
                        </View>
                    ) : (
                        <View style={styles.progressContainer}>
                            <Text style={styles.progressText}>Your Ballot: {pickingProgress.picked}/{pickingProgress.total} Categories Locked</Text>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${(pickingProgress.picked / pickingProgress.total) * 100}%` }]} />
                            </View>
                            <Text style={{ color: '#666', fontSize: 10, marginTop: 5, textAlign: 'center' }}>Polls close at 6:00 PM CST on awards day</Text>
                        </View>
                    )}
                </View>

                {/* Categories */}
                {event.categories.map((category) => {
                    const analyticalPick = calculateAnalyticalPick(category);
                    const myPickId = userBallot[category.id];

                    // Does Actual Winner exist?
                    const actualWinnerId = category.winnerMusicId;
                    const hasWinner = !!actualWinnerId;

                    return (
                        <View key={category.id} style={[styles.categoryCard, locked && !myPickId && { opacity: 0.5 }]}>
                            <View style={styles.categoryHeader}>
                                <Text style={styles.categoryTitle}>{category.name}</Text>
                                {/* Correct/Incorrect Indicator Next to Title? */}
                                {hasWinner && myPickId && (
                                    <View style={[styles.resultBadge, myPickId === actualWinnerId ? styles.resultBadgeCorrect : styles.resultBadgeWrong]}>
                                        <Text style={styles.resultText}>{myPickId === actualWinnerId ? "CORRECT" : "MISSED"}</Text>
                                    </View>
                                )}
                            </View>

                            {/* Horizontal Scroll of Nominees */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nomineeScroll}>
                                {category.nominees.map((nominee) => {
                                    const rating = userRatings[nominee.musicId.toString()];
                                    const specificScore = rating?.breakdown?.[category.awardsRatingKey];

                                    const isAnalyticalPick = analyticalPick && analyticalPick.musicId === nominee.musicId;
                                    const isMyLockedPick = myPickId === nominee.musicId;
                                    const isActualWinner = actualWinnerId === nominee.musicId; // Winner stored as TMDB ID or Unique? We switched to WinnerID. Check below.

                                    // Identifier
                                    const identifier = nominee.id || nominee.musicId;

                                    return (
                                        <TouchableOpacity
                                            key={identifier}
                                            style={[
                                                styles.nomineeCard,
                                                isMyLockedPick && styles.lockedCard,
                                                isActualWinner && styles.actualWinnerBorder // Gold Border for actual winner
                                            ]}
                                            onPress={() => handleLockPick(category, nominee)}
                                            activeOpacity={locked ? 1 : 0.7}
                                            onLongPress={() => navigateToMovie(nominee)} // Long press to see details/rate
                                        >
                                            <Image
                                                source={{ uri: nominee.artworkUrl || 'https://via.placeholder.com/100' }}
                                                style={styles.poster}
                                            />
                                            <View style={styles.nomineeInfo}>
                                                <Text style={styles.nomineeName} numberOfLines={1}>{nominee.name}</Text>
                                                <Text style={styles.nomineeMovie} numberOfLines={1}>{nominee.title}</Text>

                                                {/* User Rating Badge (New Feature) */}
                                                {rating ? (
                                                    <View style={styles.userRatingBadge}>
                                                        <Icon name="star" size={10} color="#FFD700" style={{ marginRight: 3 }} />
                                                        <Text style={styles.userRatingText}>
                                                            {/* Prefer breakdown score, otherwise show overall score */}
                                                            {specificScore ? parseFloat(specificScore).toFixed(1) : (rating.score ? parseFloat(rating.score).toFixed(1) : "N/A")}
                                                        </Text>
                                                    </View>
                                                ) : null}

                                                {/* Analytical Score Badge (Calculated Best) */}
                                                {specificScore && isAnalyticalPick ? (
                                                    <View style={styles.miniBadge}>
                                                        <Text style={styles.miniBadgeText}>{parseFloat(specificScore).toFixed(1)}</Text>
                                                    </View>
                                                ) : null}
                                            </View>

                                            {/* Overlays */}
                                            {isMyLockedPick && (
                                                <View style={[styles.lockedLabel, locked && { backgroundColor: '#555' }]}>
                                                    <Icon name={locked ? "lock" : "check"} size={10} color="#fff" />
                                                    <Text style={styles.lockedText}> {locked ? "LOCKED IN" : "LOCKED"}</Text>
                                                </View>
                                            )}

                                            {!isMyLockedPick && isAnalyticalPick && (
                                                <View style={styles.suggestedLabel}>
                                                    <Text style={styles.suggestedText}>SUGGESTED</Text>
                                                </View>
                                            )}

                                            {hasWinner && isActualWinner && (
                                                <View style={styles.actualWinnerLabel}>
                                                    <Icon name="trophy" size={12} color="#000" />
                                                    <Text style={styles.actualWinnerText}> WINNER</Text>
                                                </View>
                                            )}

                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {!myPickId && !locked && (
                                <View style={styles.alertBox}>
                                    <Icon name="info-circle" color="#888" size={14} />
                                    <Text style={styles.alertText}>Tap a movie to lock in your Manual Pick!</Text>
                                </View>
                            )}

                            {/* Summary Text */}
                            {allEvents.length > 0 && analyticalPick && !myPickId && (
                                <View style={styles.winnerSummary}>
                                    <Text style={styles.winnerSummaryText}>
                                        Analytics suggest <Text style={{ fontWeight: 'bold', color: '#aaa' }}>{analyticalPick.name}</Text>.
                                    </Text>
                                </View>
                            )}

                        </View>
                    );
                })}

                {ADMIN_UIDS.includes(auth.currentUser?.uid) && (
                    <TouchableOpacity onPress={() => navigation.navigate('AdminAwards')} style={{ marginTop: 40, alignSelf: 'center', padding: 10, borderRadius: 5, backgroundColor: '#333' }}>
                        <Text style={{ color: '#aaa', fontSize: 12 }}>Admin: Manager Nominees (Live Update)</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.attributionContainer}>
                    <Text style={styles.attributionText}>This feature is a fan-made prediction game.</Text>
                    <Text style={[styles.attributionText, { marginTop: 5 }]}>
                        TOMO Movies is not affiliated with, endorsed by, or associated with the Recording Academy or any other awards organization, studio, or individual.
                    </Text>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a1a', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    center: { justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#888', marginTop: 10 },

    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
    backButton: { marginRight: 0 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    headerSubtitle: { color: '#FFD700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 'bold', marginTop: 2 },

    tabsContainer: { height: 50, borderBottomWidth: 1, borderBottomColor: '#222' },
    tabsContent: { paddingHorizontal: 15, alignItems: 'center' },
    tabItem: { paddingHorizontal: 15, paddingVertical: 8, marginRight: 10, borderRadius: 20, backgroundColor: '#222' },
    tabItemActive: { backgroundColor: '#e50914' },
    tabText: { color: '#888', fontWeight: '600', fontSize: 13 },
    tabTextActive: { color: '#fff' },

    scrollContent: { paddingBottom: 40 },

    eventBanner: { backgroundColor: '#161625', padding: 20, marginBottom: 20 },
    eventName: { color: '#FFD700', fontSize: 22, fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
    eventDate: { color: '#aaa', textAlign: 'center', marginBottom: 15, fontSize: 14 },

    progressContainer: { marginTop: 10 },
    progressText: { color: '#fff', marginBottom: 8, fontSize: 12, fontWeight: 'bold' },
    progressBarBg: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#e50914' },

    categoryCard: { marginBottom: 25, paddingLeft: 20 },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 20, marginBottom: 15 },
    categoryTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1 },

    nomineeScroll: { paddingRight: 20 },
    nomineeCard: { width: 120, marginRight: 15, position: 'relative', opacity: 0.8 },
    lockedCard: { opacity: 1 }, // Highlight
    actualWinnerBorder: { borderWidth: 2, borderColor: '#FFD700', borderRadius: 8 },

    poster: { width: 120, height: 180, borderRadius: 8, backgroundColor: '#222' },
    nomineeInfo: { marginTop: 8 },
    nomineeName: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    nomineeMovie: { color: '#888', fontSize: 10, marginBottom: 4 },

    miniBadge: { position: 'absolute', top: -175, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, borderRadius: 3 },
    miniBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    lockedLabel: { position: 'absolute', top: 10, left: 0, right: 0, backgroundColor: '#e50914', paddingVertical: 4, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    lockedText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },

    suggestedLabel: { position: 'absolute', top: 10, left: 0, right: 0, backgroundColor: '#444', paddingVertical: 4, alignItems: 'center' },
    suggestedText: { color: '#aaa', fontWeight: 'bold', fontSize: 8 },

    actualWinnerLabel: { position: 'absolute', bottom: 40, left: 0, right: 0, backgroundColor: '#FFD700', paddingVertical: 4, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    actualWinnerText: { color: '#000', fontWeight: 'bold', fontSize: 10 },

    alertBox: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#1a1a2e', padding: 8, borderRadius: 5, alignSelf: 'flex-start' },
    alertText: { color: '#666', fontSize: 10, marginLeft: 5 },

    winnerSummary: { marginTop: 5 },
    winnerSummaryText: { color: '#888', fontSize: 11, fontStyle: 'italic' },

    seedButton: { marginTop: 20, backgroundColor: '#333', padding: 10, borderRadius: 5 },
    seedText: { color: '#888', fontSize: 12 },

    resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginLeft: 10 },
    resultBadgeCorrect: { backgroundColor: 'green' },
    resultBadgeWrong: { backgroundColor: '#b00' },
    resultText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    lockedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, padding: 8, backgroundColor: '#d32f2f', borderRadius: 5 },
    lockedBannerText: { color: '#fff', fontWeight: 'bold', textTransform: 'uppercase' },

    resultsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
    scoreContainer: { alignItems: 'center', backgroundColor: 'rgba(255, 215, 0, 0.1)', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)' },
    scoreLabel: { color: '#FFD700', fontSize: 9, fontWeight: 'bold', letterSpacing: 1, marginBottom: 2 },
    scoreValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    scoreSubtext: { color: '#aaa', fontSize: 9 },

    userRatingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 215, 0, 0.15)', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, borderWidth: 1, borderColor: '#FFD700' },
    userRatingText: { color: '#FFD700', fontSize: 11, fontWeight: 'bold' },

    attributionContainer: { padding: 20, alignItems: 'center', justifyContent: 'center', opacity: 0.5, marginTop: 20 },
    attributionText: { color: '#fff', fontSize: 10, fontStyle: 'italic', textAlign: 'center' }

});

export default AwardsHubScreen;
