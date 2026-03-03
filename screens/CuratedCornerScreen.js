import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Platform, StatusBar, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import { subscribeToCurations, likeCuration, formatArtworkUrl, followUser, unfollowUser } from '../api/MusicService';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { MusicContext } from '../context/MusicContext'; // Import Context
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';

const CuratedCornerScreen = () => {
    const navigation = useNavigation();
    const { addList } = useContext(MusicContext); // Use addList
    const [allCurations, setAllCurations] = useState([]); // Store all
    const [displayedCurations, setDisplayedCurations] = useState([]); // Store filtered
    const [loading, setLoading] = useState(true);
    const [followingList, setFollowingList] = useState([]); // Array of UIDs
    const [feedType, setFeedType] = useState('all'); // 'all', 'following', or 'myposts'

    // 1. Fetch User's Following List
    useEffect(() => {
        const fetchFollowing = async () => {
            if (auth.currentUser) {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists()) {
                    const following = userDoc.data().following || [];
                    // Extract UIDs if stored as objects, or use directly if strings
                    const uids = following.map(f => f.uid || f);
                    setFollowingList(uids);
                }
            }
        };
        fetchFollowing();
    }, [feedType]); // Re-fetch when toggling to ensure freshness

    // 2. Subscribe to Feed
    useEffect(() => {
        const unsubscribe = subscribeToCurations((data) => {
            setAllCurations(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // 3. Filter Feed
    useEffect(() => {
        if (feedType === 'following') {
            const filtered = allCurations.filter(item => followingList.includes(item.userId) || item.userId === auth.currentUser?.uid);
            setDisplayedCurations(filtered);
        } else if (feedType === 'myposts') {
            const filtered = allCurations.filter(item => item.userId === auth.currentUser?.uid);
            setDisplayedCurations(filtered);
        } else {
            setDisplayedCurations(allCurations);
        }
    }, [allCurations, followingList, feedType]);

    const handleLike = async (item) => {
        if (!auth.currentUser) return;
        await likeCuration(item.id, auth.currentUser.uid, item.likes, item.likedBy || []);
    };

    const handleFollowToggle = async (targetUid) => {
        if (!auth.currentUser) return;
        if (followingList.includes(targetUid)) {
            // Unfollow
            setFollowingList(prev => prev.filter(id => id !== targetUid)); // Optimistic
            await unfollowUser(auth.currentUser.uid, targetUid);
        } else {
            // Follow
            setFollowingList(prev => [...prev, targetUid]); // Optimistic
            await followUser(auth.currentUser.uid, targetUid);
        }
    };

    const handleAddToLibrary = (item) => {
        Alert.alert(
            "Save Collection",
            `Save "${item.title}" to your lists?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Save",
                    onPress: () => {
                        const newList = {
                            id: uuidv4(),
                            name: item.title,
                            albums: item.albums || []
                        };
                        addList(newList);
                        Alert.alert("Success", "Added to your Library!");
                    }
                }
            ]
        );
    };

    const renderCurationItem = ({ item }) => {
        const isLiked = auth.currentUser && item.likedBy && item.likedBy.includes(auth.currentUser.uid);
        const timeString = item.timestamp ? moment(item.timestamp.toDate ? item.timestamp.toDate() : item.timestamp).fromNow() : 'Just now';
        const isFollowing = followingList.includes(item.userId);
        const isMe = auth.currentUser?.uid === item.userId;

        return (
            <View style={styles.card}>
                {/* Header: User Info & Follow */}
                <View style={styles.cardHeader}>
                    <TouchableOpacity
                        style={styles.userInfo}
                        onPress={() => navigation.navigate('PublicProfile', { userId: item.userId })}
                    >
                        <Image
                            source={item.userPhoto ? { uri: item.userPhoto } : { uri: 'https://via.placeholder.com/40' }}
                            style={styles.avatar}
                        />
                        <View>
                            <Text style={styles.username}>@{item.username}</Text>
                            <Text style={styles.timestamp}>{timeString}</Text>
                        </View>
                    </TouchableOpacity>

                    {!isMe && (
                        <TouchableOpacity
                            style={[styles.followButton, isFollowing && styles.followingButton]}
                            onPress={() => handleFollowToggle(item.userId)}
                        >
                            <Text style={[styles.followText, isFollowing && styles.followingText]}>
                                {isFollowing ? "Following" : "Follow"}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Content: Title & Description */}
                <View style={styles.cardContent}>
                    <Text style={styles.curationTitle}>{item.title}</Text>
                    {item.description ? <Text style={styles.curationDesc}>{item.description}</Text> : null}
                </View>

                {/* Album Grid (Preview up to 4) */}
                <View style={styles.albumGrid}>
                    {item.albums && item.albums.slice(0, 4).map((album, index) => (
                        <TouchableOpacity
                            key={`${item.id}-album-${index}`}
                            style={styles.gridItem}
                            onPress={() => navigation.navigate('AlbumDetails', { albumId: album.id, album: album })}
                        >
                            <Image
                                source={{ uri: formatArtworkUrl(album.attributes?.artwork?.url, 200, 200) }}
                                style={styles.albumCover}
                            />
                        </TouchableOpacity>
                    ))}
                    {item.albums && item.albums.length > 4 && (
                        <View style={styles.moreOverlay}>
                            <Text style={styles.moreText}>+{item.albums.length - 4}</Text>
                        </View>
                    )}
                </View>

                {/* Actions: Like & Save */}
                <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item)}>
                        <Icon name={isLiked ? "heart" : "heart-o"} size={20} color={isLiked ? "#E0245E" : "#657786"} />
                        <Text style={[styles.actionText, isLiked && { color: "#E0245E" }]}>{item.likes || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton} onPress={() => handleAddToLibrary(item)}>
                        <Icon name="bookmark-o" size={20} color="#657786" />
                        <Text style={styles.actionText}>Save</Text>
                    </TouchableOpacity>

                    {/* Share Placeholder */}
                    <TouchableOpacity style={styles.actionButton}>
                        <Icon name="share-square-o" size={20} color="#657786" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>The Corner</Text>
                <Icon name="diamond" size={20} color="#d4a03e" />
            </View>

            {/* Feed Toggle */}
            <View style={styles.toggleContainer}>
                <TouchableOpacity
                    style={[styles.toggleButton, feedType === 'all' && styles.toggleActive]}
                    onPress={() => setFeedType('all')}
                >
                    <Text style={[styles.toggleText, feedType === 'all' && styles.toggleTextActive]}>All Posts</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleButton, feedType === 'myposts' && styles.toggleActive]}
                    onPress={() => setFeedType('myposts')}
                >
                    <Text style={[styles.toggleText, feedType === 'myposts' && styles.toggleTextActive]}>My Posts</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleButton, feedType === 'following' && styles.toggleActive]}
                    onPress={() => setFeedType('following')}
                >
                    <Text style={[styles.toggleText, feedType === 'following' && styles.toggleTextActive]}>Following</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#d4a03e" />
                </View>
            ) : (
                <FlatList
                    data={displayedCurations}
                    renderItem={renderCurationItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingBottom: 80 }}
                    ListEmptyComponent={
                        <View style={styles.centerContent}>
                            <Text style={styles.emptyText}>
                                {feedType === 'following' ? "Follow users to see their picks!"
                                    : feedType === 'myposts' ? "You haven't posted any lists yet!\n\nHead over to your Lists and tap the diamond icon at the top to publish your first collection."
                                        : "Be the first to curate a collection!"}
                            </Text>
                        </View>
                    }
                />
            )}

        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#000',
        fontFamily: Platform.OS === 'ios' ? 'Gill Sans' : 'sans-serif-medium'
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        padding: 10,
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    toggleButton: {
        paddingVertical: 6,
        paddingHorizontal: 15,
        borderRadius: 20,
        marginHorizontal: 5,
        backgroundColor: '#F2F2F2'
    },
    toggleActive: {
        backgroundColor: '#d4a03e'
    },
    toggleText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 14
    },
    toggleTextActive: {
        color: '#fff'
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 50
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
        fontStyle: 'italic'
    },
    card: {
        backgroundColor: '#fff',
        marginHorizontal: 15,
        marginTop: 15,
        borderRadius: 12,
        padding: 15,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        alignItems: 'center'
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#eee'
    },
    username: {
        fontWeight: 'bold',
        color: '#000',
        fontSize: 14
    },
    timestamp: {
        color: '#999',
        fontSize: 12
    },
    followButton: {
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#d4a03e',
    },
    followingButton: {
        backgroundColor: '#d4a03e'
    },
    followText: {
        color: '#d4a03e',
        fontWeight: 'bold',
        fontSize: 12
    },
    followingText: {
        color: '#fff'
    },
    cardContent: {
        marginBottom: 10
    },
    curationTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 5
    },
    curationDesc: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20
    },
    albumGrid: {
        flexDirection: 'row',
        marginBottom: 15,
        borderRadius: 8,
        overflow: 'hidden'
    },
    gridItem: {
        width: '25%',
        aspectRatio: 1,
        padding: 2
    },
    albumCover: {
        width: '100%',
        height: '100%',
        borderRadius: 4
    },
    moreOverlay: {
        position: 'absolute',
        right: 2,
        bottom: 2,
        width: '24%', // Match grid item roughly
        aspectRatio: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 4
    },
    moreText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    cardActions: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        paddingTop: 10
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 20
    },
    actionText: {
        marginLeft: 5,
        color: '#657786',
        fontSize: 14
    },
    emptyText: {
        fontSize: 16,
        color: '#657786',
        textAlign: 'center'
    }
});

export default CuratedCornerScreen;
