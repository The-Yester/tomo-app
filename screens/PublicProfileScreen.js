import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, Alert, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { sendPushNotification, getUserPushToken } from '../services/NotificationService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MusicContext } from '../context/MusicContext';
import { formatArtworkUrl } from '../api/MusicService';

const PublicProfileScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { userId } = route.params; // The user we want to view

    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [hydratedTopFriends, setHydratedTopFriends] = useState([]);
    const [top10OfYear, setTop10OfYear] = useState([]);
    const currentYear = new Date().getFullYear().toString();
    const { addAlbumToList } = useContext(MusicContext);

    // Likers Modal State
    const [likersModalVisible, setLikersModalVisible] = useState(false);
    const [likersList, setLikersList] = useState([]);
    const [loadingLikers, setLoadingLikers] = useState(false);

    useEffect(() => {
        fetchProfile();
    }, [userId]);

    const fetchProfile = async () => {
        try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                const data = userDoc.data();

                // Deduplicate Social Counts for Display
                if (data.following) {
                    const unique = [];
                    const seen = new Set();
                    data.following.forEach(u => {
                        const uid = u.uid || u;
                        if (!seen.has(uid)) {
                            seen.add(uid);
                            unique.push(u);
                        }
                    });
                    data.following = unique;
                }

                if (data.followers) {
                    const unique = [];
                    const seen = new Set();
                    data.followers.forEach(u => {
                        const uid = u.uid || u;
                        if (!seen.has(uid)) {
                            seen.add(uid);
                            unique.push(u);
                        }
                    });
                    data.followers = unique;
                }

                setUserData(data);

                // Fetch fresh Top Friends data
                if (data.topFriends && data.topFriends.length > 0) {
                    const friendPromises = data.topFriends.map(async (f) => {
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

                // Process Top 10 Albums of the Year
                let ratedAlbums = [];
                if (data.overallRatedAlbums && data.overallRatedAlbums.length > 0) {
                    ratedAlbums = data.overallRatedAlbums;
                } else {
                    // Backfetch ratings if the array isn't explicitly on the user doc
                    const ratingsRef = collection(db, "users", userId, "album_ratings");
                    const ratingsSnap = await getDocs(ratingsRef);
                    if (!ratingsSnap.empty) {
                        const restoredPromises = ratingsSnap.docs.map(async (docSnap) => {
                            const ratingData = docSnap.data();
                            const albumId = docSnap.id;
                            const albumDocRef = doc(db, "albums", albumId);
                            const albumSnap = await getDoc(albumDocRef);
                            if (albumSnap.exists()) {
                                const meta = albumSnap.data();
                                return {
                                    id: albumId,
                                    name: meta.name || "Unknown",
                                    artistName: meta.artistName || "Unknown",
                                    artwork: meta.artwork || null,
                                    userOverallRating: ratingData.score,
                                    releaseDate: meta.releaseDate || null
                                };
                            }
                            return null;
                        });
                        const results = await Promise.all(restoredPromises);
                        ratedAlbums = results.filter(Boolean);
                    }
                }

                if (ratedAlbums.length > 0) {
                    const thisYearAlbums = ratedAlbums.filter(album => album.releaseDate && album.releaseDate.startsWith(currentYear));
                    thisYearAlbums.sort((a, b) => (b.userOverallRating || 0) - (a.userOverallRating || 0));
                    setTop10OfYear(thisYearAlbums.slice(0, 10));
                }

                // Check if current user follows this user
                if (auth.currentUser) {
                    const currentUserDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                    if (currentUserDoc.exists()) {
                        const currentUserData = currentUserDoc.data();
                        const following = currentUserData.following || [];
                        setIsFollowing(following.some(f => (f.uid || f) === userId));
                    }
                }
            } else {
                Alert.alert("Error", "User not found.");
                navigation.goBack();
            }
        } catch (error) {
            console.error("Error fetching public profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFollowToggle = async () => {
        if (!auth.currentUser) return;

        try {
            const currentUserId = auth.currentUser.uid;
            const targetUserRef = doc(db, "users", userId);
            const currentUserRef = doc(db, "users", currentUserId);

            // Fetch latest data for both
            const [targetSnap, currentUserSnap] = await Promise.all([
                getDoc(targetUserRef),
                getDoc(currentUserRef)
            ]);

            if (!targetSnap.exists() || !currentUserSnap.exists()) return;

            const targetData = targetSnap.data();
            const currentUserData = currentUserSnap.data();

            // Prepare objects
            const targetUserInfo = {
                uid: userId,
                username: targetData.username || 'Unknown',
                profilePhoto: targetData.profilePhoto || null
            };

            const myselfInfo = {
                uid: currentUserId,
                username: currentUserData.username || 'Unknown',
                profilePhoto: currentUserData.profilePhoto || null
            };

            let newFollowing = currentUserData.following || [];
            let newFollowers = targetData.followers || [];
            let isNowFollowing = false;

            if (isFollowing) {
                // UNFOLLOW
                newFollowing = newFollowing.filter(f => (f.uid || f) !== userId);
                newFollowers = newFollowers.filter(f => (f.uid || f) !== currentUserId);
                isNowFollowing = false;
            } else {
                // FOLLOW
                newFollowing = newFollowing.filter(f => (f.uid || f) !== userId);
                newFollowing.push(targetUserInfo);

                newFollowers = newFollowers.filter(f => (f.uid || f) !== currentUserId);
                newFollowers.push(myselfInfo);
                isNowFollowing = true;
            }

            // Write updates
            await updateDoc(currentUserRef, { following: newFollowing });
            await updateDoc(targetUserRef, { followers: newFollowers });

            setIsFollowing(isNowFollowing);

            // Send Notification only on Follow
            if (isNowFollowing) {
                const token = await getUserPushToken(userId);
                if (token) {
                    await sendPushNotification(
                        token,
                        "New Follower! 🌟",
                        `${myselfInfo.username} started following you.`,
                        { type: 'profile', userId: currentUserId }
                    );
                }
            }
        } catch (error) {
            console.error("Error toggling follow:", error);
            Alert.alert("Error", "Action failed.");
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#ff8c00" />
            </View>
        );
    }

    if (!userData) return null;

    // Parse Top Albums
    let top8 = [];
    if (userData.topAlbums) {
        if (Array.isArray(userData.topAlbums)) top8 = userData.topAlbums;
        else try { top8 = JSON.parse(userData.topAlbums); } catch (e) { }
    }

    // Recently Listened (was recentlyPlayed in MusicContext, but let's check userData field name)
    // ProfileHelpers usually saves to 'recentlyPlayed' or 'recentActivity'.
    // MusicContext saves to 'recentlyPlayed'.
    const recentlyListened = userData.recentlyPlayed || [];

    // Listen Later (Find list 2 or Name "Listen Later")
    let listenLaterAlbums = [];
    if (userData.musicLists) {
        const listenLaterList = userData.musicLists.find(l => l.id === 2 || l.name === "Listen Later");
        if (listenLaterList && listenLaterList.albums) listenLaterAlbums = listenLaterList.albums;
    }

    const handleAddToList = (album) => {
        if (!auth.currentUser) {
            Alert.alert("Login Required", "Please login.");
            return;
        }
        // Add to "Listen Later" (ID: 2) by default from public profile
        addAlbumToList(2, album);
        Alert.alert("Added", `Added ${album.name} to Listen Later.`);
    };

    const handleLikeToggle = async (album) => {
        if (!auth.currentUser) {
            Alert.alert("Login Required", "Please login.");
            return;
        }

        const currentUserId = auth.currentUser.uid;
        const targetUserRef = doc(db, "users", userId);

        try {
            const userSnap = await getDoc(targetUserRef);
            if (!userSnap.exists()) return;

            let data = userSnap.data();
            let currentTopAlbums = [];

            if (data.topAlbums) {
                if (Array.isArray(data.topAlbums)) currentTopAlbums = data.topAlbums;
                else try { currentTopAlbums = JSON.parse(data.topAlbums); } catch (e) { }
            }

            // Find album index
            const index = currentTopAlbums.findIndex(a => a.id === album.id);
            if (index === -1) return;

            let targetAlbum = { ...currentTopAlbums[index] };
            let likedBy = targetAlbum.likedBy || [];

            if (likedBy.includes(currentUserId)) {
                likedBy = likedBy.filter(uid => uid !== currentUserId);
            } else {
                likedBy.push(currentUserId);
            }

            targetAlbum.likedBy = likedBy;
            targetAlbum.vote_count = likedBy.length;

            currentTopAlbums[index] = targetAlbum;

            await updateDoc(targetUserRef, { topAlbums: currentTopAlbums });

            // Optimistic update
            setUserData(prev => {
                return { ...prev, topAlbums: currentTopAlbums };
            });

        } catch (error) {
            console.error("Error toggling like:", error);
            Alert.alert("Error", "Could not update like.");
        }
    };

    const handleViewLikers = async (album) => {
        const likedBy = album.likedBy || [];
        if (likedBy.length === 0) return;

        setLoadingLikers(true);
        setLikersModalVisible(true);
        setLikersList([]);

        try {
            const promises = likedBy.map(uid => getDoc(doc(db, "users", uid)));
            const snapshots = await Promise.all(promises);
            const users = snapshots
                .filter(snap => snap.exists())
                .map(snap => ({ uid: snap.id, ...snap.data() }));

            setLikersList(users);
        } catch (error) {
            console.error("Error fetching likers:", error);
            Alert.alert("Error", "Could not load likes.");
        } finally {
            setLoadingLikers(false);
        }
    };

    const renderRatingBadge = (item) => {
        if (!item.userRating && item.userRating !== 0) return null;

        const rating = parseFloat(item.userRating);
        const method = item.ratingMethod;

        let displayValue = "";
        let iconName = "";
        let iconColor = "";
        let Component = null;

        if (method === 'Percentage' || method === 'percentage') {
            displayValue = `${rating.toFixed(0)}%`;
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

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="chevron-left" size={24} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{userData.username}'s Space</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Header */}
                <View style={styles.profileHeader}>
                    <View style={styles.profileImageContainer}>
                        <Image
                            source={userData.profilePhoto ? { uri: userData.profilePhoto } : require('../assets/profile_placeholder.jpg')}
                            style={styles.profileImage}
                        />
                    </View>
                    <View style={styles.profileInfo}>
                        <Text style={styles.name}>{userData.name}</Text>
                        <Text style={styles.location}>{userData.location || "Unknown Location"}</Text>

                        {/* Follow Button */}
                        {auth.currentUser && auth.currentUser.uid !== userId && (
                            <TouchableOpacity
                                style={[styles.followButton, isFollowing ? styles.followingBtn : styles.followBtn]}
                                onPress={handleFollowToggle}
                            >
                                <Icon name={isFollowing ? "check" : "user-plus"} size={14} color={isFollowing ? "#C6A87C" : "white"} style={{ marginRight: 5 }} />
                                <Text style={[styles.followText, isFollowing && { color: '#C6A87C' }]}>
                                    {isFollowing ? "Following" : "Follow"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Rating Method Badge */}
                    <View style={styles.ratingBadgeContainerProfile}>
                        <Text style={styles.ratingBadgeTitle}>Rating Style</Text>
                        {(!userData.ratingMethod || userData.ratingMethod === '1-5') && (
                            <>
                                <MaterialIcon name="pizza" size={40} color="#FF5722" />
                                <Text style={styles.ratingBadgeTextProfile}>(1-5)</Text>
                            </>
                        )}
                        {(userData.ratingMethod === '1-10' || userData.ratingMethod === 'Classic') && (
                            <>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFC107', justifyContent: 'center', alignItems: 'center', marginBottom: 2 }}>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>10</Text>
                                </View>
                                <Text style={styles.ratingBadgeTextProfile}>(1-10)</Text>
                            </>
                        )}
                        {userData.ratingMethod === 'Percentage' && (
                            <>
                                <Icon name="percent" size={36} color="#4CAF50" />
                                <Text style={styles.ratingBadgeTextProfile}>(%)</Text>
                            </>
                        )}
                        {userData.ratingMethod === 'Awards' && (
                            <>
                                <Icon name="trophy" size={40} color="#FFD700" />
                                <Text style={styles.ratingBadgeTextProfile}>(Awards)</Text>
                            </>
                        )}
                        {userData.ratingMethod === 'Thumbs' && (
                            <>
                                <MaterialIcon name="thumb-up" size={40} color="#4CAF50" />
                                <Text style={styles.ratingBadgeTextProfile}>(Diff)</Text>
                            </>
                        )}
                    </View>
                </View>

                <View style={styles.bioSection}>
                    <Text style={styles.bio}>{userData.bio || "No bio yet."}</Text>

                    {/* Stats Container */}
                    <View style={styles.statsContainer}>
                        <TouchableOpacity
                            style={styles.statItem}
                            onPress={() => navigation.navigate('FollowList', {
                                title: `${userData.username}'s Following`,
                                userList: userData.following || [],
                                currentUserId: auth.currentUser?.uid,
                                isOwnFollowers: false
                            })}
                        >
                            <Text style={styles.statNumber}>{userData.following?.length || 0}</Text>
                            <Text style={styles.statLabel}>Following</Text>
                        </TouchableOpacity>
                        <View style={styles.statSeparator} />
                        <TouchableOpacity
                            style={styles.statItem}
                            onPress={() => navigation.navigate('FollowList', {
                                title: `${userData.username}'s Followers`,
                                userList: userData.followers || [],
                                currentUserId: auth.currentUser?.uid,
                                isOwnFollowers: false
                            })}
                        >
                            <Text style={styles.statNumber}>{userData.followers?.length || 0}</Text>
                            <Text style={styles.statLabel}>Followers</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.separator} />

                {/* Top 4 Friends */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Top 4 Friends</Text>
                    {(hydratedTopFriends.length > 0 || (userData.topFriends && userData.topFriends.length > 0)) ? (
                        <View style={styles.topFriendsContainer}>
                            {(hydratedTopFriends.length > 0 ? hydratedTopFriends : userData.topFriends).map((friend) => (
                                <TouchableOpacity
                                    key={friend.uid}
                                    style={styles.topFriendItem}
                                    onPress={() => navigation.push('PublicProfile', { userId: friend.uid })}
                                >
                                    <Image
                                        source={friend.profilePhoto ? { uri: friend.profilePhoto } : require('../assets/profile_placeholder.jpg')}
                                        style={styles.topFriendImage}
                                    />
                                    <Text style={styles.topFriendName} numberOfLines={1}>{friend.username}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>No Top Friends selected.</Text>
                    )}
                </View>

                <View style={styles.separator} />

                {/* Top 8 Albums */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{userData.username}'s Top 8 Albums</Text>
                    {top8.length > 0 ? (
                        <View style={styles.top8Grid}>
                            {top8.map((item) => {
                                const likedBy = item.likedBy || [];
                                const isLiked = auth.currentUser && likedBy.includes(auth.currentUser.uid);
                                const likeCount = likedBy.length;
                                const artworkUrl = item.artwork ? formatArtworkUrl(item.artwork.url, 200, 200) : null;

                                return (
                                    <View key={item.id} style={styles.top8ItemContainer}>
                                        <TouchableOpacity
                                            style={styles.top8Item}
                                            onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
                                        >
                                            {artworkUrl ? (
                                                <Image
                                                    source={{ uri: artworkUrl }}
                                                    style={styles.top8Image}
                                                />
                                            ) : (
                                                <View style={[styles.top8Image, { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                                                    <Text style={{ fontSize: 10 }}>No Art</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>

                                        {/* Actions Row */}
                                        <View style={styles.actionButtonsRow}>
                                            <View style={styles.miniButtonSplit}>
                                                <TouchableOpacity
                                                    style={[styles.miniButtonLeft, isLiked && styles.miniButtonActive]}
                                                    onPress={() => handleLikeToggle(item)}
                                                >
                                                    <Icon name="heart" size={10} color={isLiked ? "white" : "#e50914"} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.miniButtonRight, isLiked && styles.miniButtonActive]}
                                                    onPress={() => handleViewLikers(item)}
                                                    disabled={likeCount === 0}
                                                >
                                                    <Text style={[styles.miniButtonText, isLiked && { color: 'white' }]}>
                                                        {likeCount > 0 ? likeCount : '0'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            <TouchableOpacity
                                                style={[styles.miniButton, { backgroundColor: '#4682b4', marginLeft: 5 }]}
                                                onPress={() => handleAddToList(item)}
                                            >
                                                <Icon name="plus" size={10} color="white" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>No Top albums selected yet.</Text>
                    )}
                </View>

                {/* Top 10 Of Year Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{userData.username}'s Top 10 Albums of {currentYear}</Text>
                    {top10OfYear.length > 0 ? (
                        <FlatList
                            horizontal
                            data={top10OfYear}
                            keyExtractor={(item, index) => `top10-${item.id}-${index}`}
                            showsHorizontalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const artworkUrl = item.attributes?.artwork?.url
                                    ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
                                    : item.artwork?.url
                                        ? formatArtworkUrl(item.artwork.url, 200, 200)
                                        : item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
                                // Alias the rating so badge renderer works
                                const itemForBadge = { ...item, userRating: item.userOverallRating, ratingMethod: userData.ratingMethod || '1-10' };

                                return (
                                    <TouchableOpacity
                                        style={styles.posterItem}
                                        onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
                                    >
                                        {artworkUrl ? (
                                            <Image
                                                source={{ uri: artworkUrl }}
                                                style={styles.posterImage}
                                            />
                                        ) : (
                                            <View style={[styles.posterImage, { backgroundColor: '#ccc' }]} />
                                        )}
                                        <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes?.name || item.name || item.title || 'Unknown'}</Text>
                                        <Text style={styles.artistName} numberOfLines={1}>{item.attributes?.artistName || item.artistName || 'Unknown Artist'}</Text>
                                        {renderRatingBadge(itemForBadge)}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    ) : (
                        <Text style={styles.emptyText}>No albums released in {currentYear} rated yet.</Text>
                    )}
                </View>

                <View style={styles.separator} />

                {/* Recent Activity Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recently Rated</Text>
                    {(userData.recentActivity && userData.recentActivity.length > 0) ? (
                        <FlatList
                            horizontal
                            data={userData.recentActivity}
                            keyExtractor={(item, index) => `activity-${item.id}-${index}`}
                            showsHorizontalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const artworkUrl = item.attributes?.artwork?.url
                                    ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
                                    : item.artwork?.url
                                        ? formatArtworkUrl(item.artwork.url, 200, 200)
                                        : item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
                                return (
                                    <TouchableOpacity
                                        style={styles.posterItem}
                                        onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
                                    >
                                        {artworkUrl ? (
                                            <Image
                                                source={{ uri: artworkUrl }}
                                                style={styles.posterImage}
                                            />
                                        ) : (
                                            <View style={[styles.posterImage, { backgroundColor: '#ccc' }]} />
                                        )}
                                        <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes?.name || item.name || item.title || 'Unknown'}</Text>
                                        <Text style={styles.artistName} numberOfLines={1}>{item.attributes?.artistName || item.artistName || 'Unknown Artist'}</Text>
                                        {renderRatingBadge(item)}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    ) : (
                        <Text style={styles.emptyText}>No recent interactions.</Text>
                    )}
                </View>

                {/* Recently Listened */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recently Listened</Text>
                    {recentlyListened.length > 0 ? (
                        <FlatList
                            horizontal
                            data={recentlyListened}
                            keyExtractor={(item, index) => `recent-${item.id}-${index}`}
                            showsHorizontalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const artworkUrl = item.attributes?.artwork?.url
                                    ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
                                    : item.artwork?.url
                                        ? formatArtworkUrl(item.artwork.url, 200, 200)
                                        : item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
                                return (
                                    <TouchableOpacity
                                        style={styles.posterItem}
                                        onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
                                    >
                                        {artworkUrl ? (
                                            <Image
                                                source={{ uri: artworkUrl }}
                                                style={styles.posterImage}
                                            />
                                        ) : (
                                            <View style={[styles.posterImage, { backgroundColor: '#ccc' }]} />
                                        )}
                                        <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes?.name || item.name || item.title || 'Unknown'}</Text>
                                        <Text style={styles.artistName} numberOfLines={1}>{item.attributes?.artistName || item.artistName || 'Unknown Artist'}</Text>
                                        {renderRatingBadge(item)}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    ) : (
                        <Text style={styles.emptyText}>No recent activity.</Text>
                    )}
                </View>

                <View style={styles.separator} />

                {/* Listen Later / Watchlist */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Listen Later</Text>
                    {listenLaterAlbums.length > 0 ? (
                        <FlatList
                            horizontal
                            data={listenLaterAlbums}
                            keyExtractor={item => `watchlist-${item.id}`}
                            showsHorizontalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const artworkUrl = item.attributes?.artwork?.url
                                    ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
                                    : item.artwork?.url
                                        ? formatArtworkUrl(item.artwork.url, 200, 200)
                                        : item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
                                return (
                                    <TouchableOpacity
                                        style={styles.posterItem}
                                        onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
                                    >
                                        {artworkUrl ? (
                                            <Image
                                                source={{ uri: artworkUrl }}
                                                style={styles.posterImage}
                                            />
                                        ) : (
                                            <View style={[styles.posterImage, { backgroundColor: '#ccc' }]} />
                                        )}
                                        <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes?.name || item.name || item.title || 'Unknown'}</Text>
                                        <Text style={styles.artistName} numberOfLines={1}>{item.attributes?.artistName || item.artistName || 'Unknown Artist'}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    ) : (
                        <Text style={styles.emptyText}>Nothing saved for later.</Text>
                    )}
                </View>

                {/* Attribution Footer */}
                <View style={styles.attributionContainer}>
                    <Text style={styles.attributionText}>Music data provided by Apple Music.</Text>
                </View>

                <View style={{ height: 40 }} />

            </ScrollView>

            {/* Likers Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={likersModalVisible}
                onRequestClose={() => setLikersModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Liked By</Text>
                            <TouchableOpacity onPress={() => setLikersModalVisible(false)}>
                                <Icon name="close" size={20} color="#000" />
                            </TouchableOpacity>
                        </View>

                        {loadingLikers ? (
                            <ActivityIndicator size="large" color="#ff8c00" style={{ marginTop: 20 }} />
                        ) : (
                            <FlatList
                                data={likersList}
                                keyExtractor={(item) => item.uid}
                                ListEmptyComponent={<Text style={styles.emptyText}>No likes yet.</Text>}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.likerItem}
                                        onPress={() => {
                                            setLikersModalVisible(false);
                                            navigation.push('PublicProfile', { userId: item.uid });
                                        }}
                                    >
                                        <Image
                                            source={item.profilePhoto ? { uri: item.profilePhoto } : require('../assets/profile_placeholder.jpg')}
                                            style={styles.likerImage}
                                        />
                                        <Text style={styles.likerName}>{item.username || "Unknown Code Name"}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2', // Light Theme
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#F2F2F2',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0'
    },
    headerTitle: {
        color: '#000',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'Trebuchet MS',
    },
    ratingBadgeContainerProfile: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 90,
        marginLeft: 10
    },
    ratingBadgeTitle: {
        color: '#C6A87C', // Gold
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 6,
        textAlign: 'center'
    },
    ratingBadgeTextProfile: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
        fontWeight: 'bold'
    },
    scrollContent: {
        padding: 0
    },
    profileHeader: {
        flexDirection: 'row',
        padding: 20,
        alignItems: 'center',
    },
    profileImageContainer: {
        marginRight: 20
    },
    profileImage: {
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 2,
        borderColor: '#C6A87C' // Gold
    },
    profileInfo: {
        flex: 1,
    },
    name: {
        color: '#000',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 5
    },
    location: {
        color: '#666',
        fontSize: 14,
        marginBottom: 10
    },
    bioSection: {
        paddingHorizontal: 20,
        paddingBottom: 20
    },
    bio: {
        color: '#333',
        fontSize: 14,
        fontStyle: 'italic',
        lineHeight: 20,
        marginBottom: 20,
    },
    followButton: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        paddingHorizontal: 15,
        paddingVertical: 6,
        borderRadius: 20,
        alignItems: 'center',
        marginTop: 5,
        borderWidth: 1,
        borderColor: '#d4a03e'
    },
    followBtn: {
        backgroundColor: '#d4a03e',
    },
    followingBtn: {
        backgroundColor: '#fff',
    },
    followText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        marginTop: 10
    },
    statItem: {
        alignItems: 'center',
        paddingHorizontal: 30
    },
    statNumber: {
        color: '#000',
        fontSize: 18,
        fontWeight: 'bold'
    },
    statLabel: {
        color: '#666',
        fontSize: 12,
        textTransform: 'uppercase'
    },
    statSeparator: {
        width: 1,
        backgroundColor: '#ccc',
        height: '100%'
    },
    separator: {
        height: 15,
        backgroundColor: '#F2F2F2',
    },
    // Sections (Gold Card Style)
    section: {
        padding: 20,
        backgroundColor: '#E5C585', // GOLD CARD
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
        color: '#000',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
    },
    topFriendsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap'
    },
    topFriendItem: {
        alignItems: 'center',
        width: '23%',
        marginBottom: 10
    },
    topFriendImage: {
        width: 55,
        height: 55,
        borderRadius: 27.5,
        borderWidth: 1,
        borderColor: '#C6A87C',
        marginBottom: 5,
        backgroundColor: '#333'
    },
    topFriendName: {
        color: '#000',
        fontSize: 11,
        textAlign: 'center'
    },
    emptyText: {
        color: '#555',
        fontStyle: 'italic',
        fontSize: 14
    },
    top8Grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between'
    },
    top8ItemContainer: {
        width: '23%',
        marginBottom: 15
    },
    top8Item: {
        width: '100%',
        aspectRatio: 1, // Album art is square
        marginBottom: 5
    },
    top8Image: {
        width: '100%',
        height: '100%',
        borderRadius: 5,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)'
    },
    actionButtonsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%'
    },
    miniButton: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.3)',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#e50914'
    },
    miniButtonSplit: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#e50914',
        overflow: 'hidden'
    },
    miniButtonLeft: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRightWidth: 1,
        borderRightColor: '#e50914'
    },
    miniButtonRight: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        minWidth: 24,
        alignItems: 'center'
    },
    miniButtonActive: {
        backgroundColor: '#e50914'
    },
    miniButtonText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#333'
    },
    posterItem: {
        marginRight: 15,
        width: 100
    },
    posterImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
        marginBottom: 5,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)'
    },
    albumTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 2,
        color: '#000',
    },
    artistName: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    ratingBadge: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        flexDirection: 'row',
        alignItems: 'center'
    },
    ratingBadgeText: {
        color: '#FFD700',
        fontSize: 8,
        fontWeight: 'bold',
        marginLeft: 2
    },
    attributionContainer: {
        padding: 20,
        alignItems: 'center'
    },
    attributionText: {
        color: '#999',
        fontSize: 10,
        textAlign: 'center'
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        padding: 20
    },
    modalContent: {
        width: '90%',
        maxHeight: '70%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#ccc'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 10
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000'
    },
    likerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0'
    },
    likerImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10
    },
    likerName: {
        fontSize: 16,
        color: '#000'
    }
});

export default PublicProfileScreen;
