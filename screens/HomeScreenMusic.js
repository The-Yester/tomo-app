import React, { useState, useContext, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ScrollView, Dimensions, SafeAreaView, Platform, StatusBar, Modal, TextInput } from 'react-native';
import { MusicContext } from '../context/MusicContext';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { getTopCharts, getNewReleases, formatArtworkUrl, getTimeCapsuleRecommendation } from '../api/MusicService';

const SCREEN_WIDTH = Dimensions.get('window').width;

const HomeScreenMusic = () => {
    const { getAlbumsInList, recentlyPlayed, recentActivity, overallRatedAlbums } = useContext(MusicContext);
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
                            <TouchableOpacity 
                                style={styles.editProfileBtn} 
                                onPress={() => navigation.navigate('ProfileSettings')}
                            >
                                <Text style={styles.editProfileBtnText}>Edit Profile</Text>
                            </TouchableOpacity>
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

                        {/* Top 4 Friends */}
                        {hydratedTopFriends.length > 0 && (
                            <View style={styles.topFriendsContainer}>
                                <Text style={styles.topFriendsTitle}>Top 4 Friends</Text>
                                <View style={styles.topFriendsRow}>
                                    {hydratedTopFriends.map((friend) => (
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
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                </View>



                {/* --- TOP 8 SECTION --- */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>My Top 8 Albums</Text>
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
        backgroundColor: '#D4AF37', // Gold
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginLeft: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
    },
    editProfileBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
        letterSpacing: 0.3
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
    topFriendsContainer: {
        marginTop: 15,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#EEE'
    },
    topFriendsTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#D4AF37', // Gold
        marginBottom: 10,
        textAlign: 'center' // Center title too? No, keep left or center? User didn't specify, but "spread evenly" usually implies symmetry. Let's keep left for title, centered grid for items.
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
        color: '#333',
        textAlign: 'center'
    },
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
    }
});

export default HomeScreenMusic;
