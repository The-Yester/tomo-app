import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { formatArtworkUrl } from '../api/MusicService';

const ProfileScreen = () => {
    const navigation = useNavigation();
    const [profilePhoto, setProfilePhoto] = useState(null);
    const [username, setUsername] = useState('');
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [bio, setBio] = useState('');
    const [ratingMethod, setRatingMethod] = useState('');
    const [topAlbums, setTopAlbums] = useState([]);
    const [topFriends, setTopFriends] = useState([]);
    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadProfileData();
        }, [])
    );

    const loadProfileData = async () => {
        setIsLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) {
                navigation.replace('Login');
                return;
            }

            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setProfilePhoto(data.profilePhoto || null);
                setUsername(data.username || '');
                setName(data.name || '');
                setLocation(data.location || '');
                setBio(data.bio || ''); // field is 'bio' in Settings, 'aboutMe' in old Profile? Settings uses 'bio'.
                setRatingMethod(data.ratingSystem || '');

                // Top Albums
                let albums = [];
                if (data.topAlbums) {
                    if (typeof data.topAlbums === 'string') {
                        try { albums = JSON.parse(data.topAlbums); } catch (e) { }
                    } else if (Array.isArray(data.topAlbums)) {
                        albums = data.topAlbums;
                    }
                }
                setTopAlbums(albums);

                setTopAlbums(albums);

                setTopFriends(data.topFriends || []);
                setFollowing(data.following || []);
                setFollowers(data.followers || []);
            }
        } catch (error) {
            console.error('Failed to load profile data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#ff8c00" />
            </View>
        );
    }

    return (
        <View style={outerStyles.container}>
            <ScrollView style={styles.container}>
                <View style={profileStyles.headerContainer}>
                    <View style={profileStyles.photoContainer}>
                        <View style={profileStyles.circularPhotoBackground}>
                            {profilePhoto ? (
                                <Image source={{ uri: profilePhoto }} style={profileStyles.profilePhoto} />
                            ) : (
                                <View style={profileStyles.placeholderPhoto}>
                                    <Text style={profileStyles.placeholderText}>No Photo</Text>
                                </View>
                            )}
                        </View>
                    </View>
                    <Text style={profileStyles.username}>{username || 'Username'}</Text>

                    {/* Bio / Slogan */}
                    {bio ? <Text style={profileStyles.bioText}>{bio}</Text> : null}

                    {/* Following / Followers */}
                    <View style={profileStyles.statsContainer}>
                        <TouchableOpacity
                            style={profileStyles.statItem}
                            onPress={() => navigation.navigate('FollowList', {
                                title: 'Following',
                                userList: following,
                                currentUserId: auth.currentUser?.uid,
                                isOwnFollowing: true
                            })}
                        >
                            <Text style={profileStyles.statNumber}>{following.length}</Text>
                            <Text style={profileStyles.statLabel}>Following</Text>
                        </TouchableOpacity>

                        <View style={profileStyles.statDivider} />

                        <TouchableOpacity
                            style={profileStyles.statItem}
                            onPress={() => navigation.navigate('FollowList', {
                                title: 'Followers',
                                userList: followers,
                                currentUserId: auth.currentUser?.uid,
                                isOwnFollowers: true
                            })}
                        >
                            <Text style={profileStyles.statNumber}>{followers.length}</Text>
                            <Text style={profileStyles.statLabel}>Followers</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={profileStyles.editProfileButton} onPress={() => navigation.navigate('ProfileSettings')}>
                        <Text style={profileStyles.editProfileText}>Edit Profile</Text>
                    </TouchableOpacity>
                </View>

                <View style={infoSectionStyles.container}>
                    <Text style={infoSectionStyles.title}>Name</Text>
                    <Text style={infoSectionStyles.text}>{name || 'N/A'}</Text>
                </View>

                <View style={infoSectionStyles.container}>
                    <Text style={infoSectionStyles.title}>Location</Text>
                    <Text style={infoSectionStyles.text}>{location || 'N/A'}</Text>
                </View>

                <View style={infoSectionStyles.container}>
                    <Text style={infoSectionStyles.title}>About Me</Text>
                    <Text style={infoSectionStyles.text}>{bio || 'N/A'}</Text>
                </View>

                <View style={infoSectionStyles.container}>
                    <Text style={infoSectionStyles.title}>Rating Method</Text>
                    <Text style={infoSectionStyles.text}>{ratingMethod || 'N/A'}</Text>
                </View>

                <View style={listSectionStyles.container}>
                    <Text style={listSectionStyles.title}>Top 8 Albums</Text>
                    <View style={listSectionStyles.grid}>
                        {topAlbums.length > 0 ? (
                            topAlbums.map((album, index) => (
                                <TouchableOpacity key={album.id || index} style={listSectionStyles.gridItem} onPress={() => navigation.navigate('AlbumDetails', { albumId: album.id })}>
                                    {album.artwork ? (
                                        <Image source={{ uri: formatArtworkUrl(album.artwork.url, 200, 200) }} style={listSectionStyles.albumArt} />
                                    ) : (
                                        <View style={[listSectionStyles.albumArt, { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                                            <Text style={{ fontSize: 10 }}>No Art</Text>
                                        </View>
                                    )}
                                    <Text numberOfLines={1} style={listSectionStyles.albumName}>{album.name}</Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={listSectionStyles.emptyText}>No albums selected.</Text>
                        )}
                    </View>
                </View>

                <View style={friendsSectionStyles.container}>
                    <Text style={friendsSectionStyles.title}>Top Friends</Text>
                    <View style={friendsSectionStyles.friendsGrid}>
                        {topFriends.length > 0 ? (
                            topFriends.map((friend, index) => (
                                <View key={friend.uid || index} style={friendsSectionStyles.friendItem}>
                                    <Image
                                        source={friend.profilePhoto ? { uri: friend.profilePhoto } : require('../assets/profile_placeholder.jpg')}
                                        style={friendsSectionStyles.friendPhoto}
                                    />
                                    <Text numberOfLines={1} style={friendsSectionStyles.friendName}>{friend.username}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={listSectionStyles.emptyText}>No Top Friends.</Text>
                        )}
                    </View>
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
};

const outerStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
});

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
});

const profileStyles = StyleSheet.create({
    headerContainer: { alignItems: 'center', marginBottom: 20, paddingTop: 20 },
    photoContainer: { position: 'relative' },
    circularPhotoBackground: {
        backgroundColor: '#222',
        width: 160,
        height: 160,
        borderRadius: 80,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#ff8c00'
    },
    profilePhoto: { width: 150, height: 150, borderRadius: 75 },
    placeholderPhoto: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    placeholderText: { fontSize: 16, color: '#aaa' },
    username: { fontSize: 24, fontWeight: 'bold', marginBottom: 5, color: 'white' },
    bioText: { color: '#ccc', fontSize: 14, marginBottom: 15, textAlign: 'center', paddingHorizontal: 20 },
    statsContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    statItem: { alignItems: 'center', paddingHorizontal: 15 },
    statNumber: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    statLabel: { color: '#888', fontSize: 12 },
    statDivider: { width: 1, height: 20, backgroundColor: '#333' },
    editProfileButton: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#444' },
    editProfileText: { color: '#fff', fontWeight: 'bold' },
});

const infoSectionStyles = StyleSheet.create({
    container: {
        backgroundColor: '#161625',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        borderLeftWidth: 3,
        borderLeftColor: '#ff8c00'
    },
    title: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, color: '#888', textTransform: 'uppercase' },
    text: { fontSize: 16, color: '#fff' },
});

const listSectionStyles = StyleSheet.create({
    container: {
        backgroundColor: '#161625',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    title: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#fff' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridItem: { width: '22%', marginBottom: 10, alignItems: 'center' },
    albumArt: { width: '100%', aspectRatio: 1, borderRadius: 5, marginBottom: 5 },
    albumName: { color: '#ccc', fontSize: 10, textAlign: 'center' },
    emptyText: { fontSize: 16, color: '#666', fontStyle: 'italic' },
});

const friendsSectionStyles = StyleSheet.create({
    container: {
        backgroundColor: '#161625',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    title: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#fff' },
    friendsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between', // Changed from gap to space-between for even spreading
    },
    friendItem: { alignItems: 'center', width: '22%' }, // Percentage width
    friendPhoto: { width: 50, height: 50, borderRadius: 25, marginBottom: 5, borderWidth: 1, borderColor: '#555' },
    friendName: { color: '#ccc', fontSize: 10, textAlign: 'center' }
});

export default ProfileScreen;