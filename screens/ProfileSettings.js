import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, Image, Modal, Alert, ActivityIndicator, Platform, Linking, Switch, KeyboardAvoidingView } from 'react-native';
import { CommonActions, useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { MusicContext } from '../context/MusicContext';
import { Picker } from '@react-native-picker/picker';
import US_CITIES from '../data/US_Cities';
import { auth, db, storage } from '../firebaseConfig';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { signOut, deleteUser } from 'firebase/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/FontAwesome';
import { registerForPushNotificationsAsync, unregisterForPushNotificationsAsync } from '../services/NotificationService';
import { searchMusic, formatArtworkUrl } from '../api/MusicService';

const ratingMethods = [
    { id: '1-10', name: "1-10 (Classic)" },
    { id: '1-5', name: "Pizza Rating" }, // Keeping legacy name or changing to "Vinyl"? Let's keep it familiar for now but maybe "5 Star"
    { id: 'Percentage', name: "Percentage (1-100%)" },
    { id: 'Awards', name: "Awards (Detailed)" }
];

const ProfileSettings = ({ navigation }) => {
    const { setRatingMethod } = useContext(MusicContext);

    // User Data State
    const [profilePhoto, setProfilePhoto] = useState(null);
    const [username, setUsername] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState(''); // Read-only mostly
    const [location, setLocation] = useState(US_CITIES[0]);
    const [bio, setBio] = useState('');
    const [selectedRatingSystem, setSelectedRatingSystem] = useState('awards');
    const [topAlbums, setTopAlbums] = useState([]);

    // Social State
    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [topFriends, setTopFriends] = useState([]);
    const [hydratedTopFriends, setHydratedTopFriends] = useState([]);
    const [isFriendModalVisible, setIsFriendModalVisible] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [friendSearchResults, setFriendSearchResults] = useState([]);

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isIdentityLocked, setIsIdentityLocked] = useState(false);

    // Search State (Music)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Notifications State
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);

    const isFocused = useIsFocused();

    useEffect(() => {
        if (isFocused) {
            loadUserData();
        }
    }, [isFocused]);

    const handleNotificationToggle = async (value) => {
        setNotificationsEnabled(value);
        if (value) {
            const token = await registerForPushNotificationsAsync();
            if (!token) {
                setNotificationsEnabled(false);
                Alert.alert("Permission Denied", "Could not enable notifications. Please check your system settings.");
            }
        } else {
            await unregisterForPushNotificationsAsync();
        }
    };

    // Hydrate Top Friends
    useEffect(() => {
        const fetchFriendsData = async () => {
            if (topFriends && topFriends.length > 0) {
                const friendPromises = topFriends.map(async (f) => {
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
    }, [topFriends]);

    React.useLayoutEffect(() => {
        navigation.setOptions({ headerShown: false });
    }, [navigation]);

    const loadUserData = async () => {
        setIsLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) {
                navigation.replace('Login');
                return;
            }

            const userDocRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setProfilePhoto(data.profilePhoto || null);
                setUsername(data.username || '');
                setName(data.name || '');
                setEmail(data.email || user.email);
                setLocation(data.location || US_CITIES[0]);
                setBio(data.bio || '');
                setSelectedRatingSystem(data.ratingSystem || 'awards');

                // Social Data
                const rawFollowing = data.following || [];
                const uniqueFollowing = [];
                const seenFollowing = new Set();
                rawFollowing.forEach(item => {
                    if (!seenFollowing.has(item.uid)) {
                        seenFollowing.add(item.uid);
                        uniqueFollowing.push(item);
                    }
                });

                const rawFollowers = data.followers || [];
                const uniqueFollowers = [];
                const seenFollowers = new Set();
                rawFollowers.forEach(item => {
                    if (!seenFollowers.has(item.uid)) {
                        seenFollowers.add(item.uid);
                        uniqueFollowers.push(item);
                    }
                });

                setFollowing(uniqueFollowing);
                setFollowers(uniqueFollowers);
                setTopFriends(data.topFriends || []);

                if (data.name && data.username) {
                    setIsIdentityLocked(true);
                } else {
                    setIsIdentityLocked(false);
                }

                // Parse topAlbums (renamed from topMovies, check both for migration)
                let albums = [];
                if (data.topAlbums) {
                    if (typeof data.topAlbums === 'string') {
                        try { albums = JSON.parse(data.topAlbums); } catch (e) { }
                    } else if (Array.isArray(data.topAlbums)) {
                        albums = data.topAlbums;
                    }
                } else if (data.topMovies) {
                    // Migration: If no topAlbums, ignore topMovies or could migrate manually, 
                    // but likely incompatible structure. Let's start fresh or ignore.
                    // Or if structure matches {id, title...} we could map.
                    // But let's assume fresh start for music.
                    albums = [];
                }
                setTopAlbums(albums);

                setRatingMethod(data.ratingSystem || 'awards');
                setNotificationsEnabled(data.notificationsEnabled || false);
            }
        } catch (error) {
            console.error("Error loading profile:", error);
            Alert.alert("Error", "Could not load profile data.");
        } finally {
            setIsLoading(false);
        }
    };

    const saveDetails = async () => {
        setIsSaving(true);
        try {
            const user = auth.currentUser;
            if (!user) return;

            const userDocRef = doc(db, "users", user.uid);
            let finalPhotoUrl = profilePhoto; // Defaults to existing photo/null

            // Streaming Upload Method: fetch().blob() -> uploadBytesResumable
            // The previous `storage/unknown` drops were identified as 404 missing buckets on Firebase Storage, NOT
            // React Native 0.74 JS Bridge corruptions. Expo perfectly routes `file://` natively straight to the JS Blob object.
            if (profilePhoto && (profilePhoto.startsWith('file:') || profilePhoto.startsWith('content:') || profilePhoto.startsWith('assets-library:'))) {
                try {
                    const response = await fetch(profilePhoto);
                    const blob = await response.blob();
                    const storageRef = ref(storage, `profile_photos/${user.uid}_${Date.now()}.jpg`);

                    const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });

                    await new Promise((resolve, reject) => {
                        uploadTask.on('state_changed',
                            null,
                            (error) => reject(error),
                            () => resolve()
                        );
                    });

                    finalPhotoUrl = await getDownloadURL(storageRef);
                } catch (e) {
                    console.error("Profile Photo Upload failed:", e);
                    Alert.alert("Upload Failed", `Reason: ${e.message || JSON.stringify(e)}`);
                    const existingDoc = await getDoc(userDocRef);
                    finalPhotoUrl = existingDoc.exists() ? existingDoc.data().profilePhoto : null;
                }
            }

            await updateDoc(userDocRef, {
                profilePhoto: finalPhotoUrl,
                name,
                username,
                location,
                bio,
                ratingSystem: selectedRatingSystem,
                topAlbums: topAlbums, // Saving as topAlbums
                topFriends: topFriends,
                username_lowercase: username.toLowerCase(),
                name_lowercase: name.toLowerCase()
            });

            setRatingMethod(selectedRatingSystem);

            Alert.alert("Success", "Profile updated successfully!");
            navigation.goBack();
        } catch (error) {
            console.error("Error saving profile:", error);
            Alert.alert("Error", "Could not save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    // --- Social Logic --- (Kept same as before)
    const searchUsers = async (text) => {
        setFriendSearchQuery(text);
        if (text.length < 1) {
            setFriendSearchResults(following);
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
        if (following.find(u => u.uid === targetUser.uid)) return;

        const newFollowingItem = { uid: targetUser.uid, username: targetUser.username || 'User', profilePhoto: targetUser.profilePhoto || null };
        setFollowing([...following, newFollowingItem]);

        await updateDoc(doc(db, "users", user.uid), { following: arrayUnion(newFollowingItem) });
        await updateDoc(doc(db, "users", targetUser.uid), { followers: arrayUnion({ uid: user.uid, username: username || 'User', profilePhoto: profilePhoto || null }) });
    };

    const toggleTopFriend = (friend) => {
        if (topFriends.find(f => f.uid === friend.uid)) {
            setTopFriends(topFriends.filter(f => f.uid !== friend.uid));
        } else {
            if (topFriends.length >= 4) {
                Alert.alert("Top 4 Full", "Remove someone first to add a new top friend.");
                return;
            }
            setTopFriends([...topFriends, friend]);
        }
    };

    // --- Music Logic ---
    const searchMusicHandler = (query) => {
        setSearchQuery(query);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (!query) {
            setSearchResults([]);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const data = await searchMusic(query);
                // Filter only albums for Top 8
                const filtered = data.filter(item => item.type === 'albums');
                setSearchResults(filtered);
            } catch (error) {
                if (error.name === 'AbortError') {
                    return; // Silence abort errors
                }
                console.error(error);
            }
        }, 500); // 500ms debounce
    };

    const addTopAlbum = (album) => {
        if (topAlbums.length >= 8) {
            Alert.alert("Limit Reached", "You can only select your Top 8 albums.");
            return;
        }
        if (topAlbums.find(a => a.id === album.id)) {
            Alert.alert("Duplicate", "This album is already in your Top 8.");
            return;
        }

        const minimalAlbum = {
            id: album.id,
            name: album.attributes.name,
            artistName: album.attributes.artistName,
            artwork: album.attributes.artwork // { url, width, height }
        };

        setTopAlbums([...topAlbums, minimalAlbum]);
        setIsSearchModalVisible(false);
        setSearchQuery('');
    };

    const removeTopAlbum = (id) => {
        setTopAlbums(topAlbums.filter(a => a.id !== id));
    };

    const cleanPickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });
        if (!result.canceled) {
            setProfilePhoto(result.assets[0].uri);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
        } catch (error) {
            console.error("Logout error:", error);
            Alert.alert("Error", "Failed to log out.");
        }
    };

    const handleDeleteAccount = async () => {
        Alert.alert("Delete Account", "Are you sure? This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    setIsSaving(true);
                    try {
                        const user = auth.currentUser;
                        if (!user) return;
                        await deleteDoc(doc(db, "users", user.uid));
                        await deleteUser(user);
                    } catch (error) {
                        console.error("Delete Account error:", error);
                        Alert.alert("Error", "Failed to delete account (Requires recent login).");
                    } finally { setIsSaving(false); }
                }
            }
        ]);
    };

    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#D4AF37" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-left" size={24} color="#D4AF37" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={saveDetails} disabled={isSaving}>
                    <Text style={styles.saveText}>{isSaving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Photo */}
                <View style={styles.photoSection}>
                    <Image
                        source={profilePhoto ? { uri: profilePhoto } : require('../assets/profile_placeholder.jpg')}
                        style={styles.profilePhoto}
                    />
                    <TouchableOpacity onPress={cleanPickImage}>
                        <Text style={styles.changePhotoText}>Change Photo</Text>
                    </TouchableOpacity>
                </View>

                {/* Info Fields */}
                <View style={styles.section}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput style={[styles.input, isIdentityLocked && styles.readOnlyInput]} value={name} onChangeText={setName} editable={!isIdentityLocked} placeholder="Your Name" placeholderTextColor="#666" />
                    <Text style={styles.label}>Username</Text>
                    <TextInput style={[styles.input, isIdentityLocked && styles.readOnlyInput]} value={username} onChangeText={setUsername} editable={!isIdentityLocked} placeholder="Username" placeholderTextColor="#666" autoCapitalize="none" />
                    <Text style={styles.label}>Bio</Text>
                    <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} placeholder="Tell us about your music taste..." placeholderTextColor="#666" multiline maxLength={150} />
                    <Text style={styles.label}>Location</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker selectedValue={location} onValueChange={setLocation} style={styles.picker}>
                            {US_CITIES.map((city) => <Picker.Item key={city} label={city} value={city} color="#000" />)}
                        </Picker>
                    </View>
                </View>

                <View style={styles.separator} />



                {/* Notification */}
                <View style={[styles.section, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={[styles.label, { marginBottom: 0 }]}>Push Notifications</Text>
                    <Switch trackColor={{ false: "#ccc", true: "#D4AF37" }} thumbColor={notificationsEnabled ? "#fff" : "#f4f3f4"} ios_backgroundColor="#EFEFEF" onValueChange={handleNotificationToggle} value={notificationsEnabled} />
                </View>

                <View style={styles.separator} />


                {/* Password - Placeholder similar to before */}
                <TouchableOpacity style={styles.passwordButton} onPress={() => Alert.alert("Note", "Password change requires re-auth.")}>
                    <Icon name="lock" size={20} color="#D4AF37" style={{ marginRight: 10 }} />
                    <Text style={styles.passwordButtonText}>Change Password</Text>
                </TouchableOpacity>



                {/* About & Footer */}
                <View style={styles.section}>
                    <Text style={styles.label}>About</Text>
                    <View style={styles.aboutRow}>
                        <Text style={styles.aboutText}>App Version</Text>
                        <Text style={[styles.aboutText, { color: '#888' }]}>1.0.0</Text>
                    </View>
                    <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL('https://sites.google.com/view/tomo-termsofservice/home')}>
                        <Text style={styles.aboutText}>Terms of Service</Text>
                        <Icon name="chevron-right" size={14} color="#666" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL('https://sites.google.com/view/tomo-privacypolicy/home')}>
                        <Text style={styles.aboutText}>Privacy Policy</Text>
                        <Icon name="chevron-right" size={14} color="#666" />
                    </TouchableOpacity>
                    <View style={styles.disclaimerRow}>
                        <Text style={[styles.aboutText, { color: '#888', fontSize: 10, textAlign: 'center', lineHeight: 14 }]}>
                            This product uses data provided by Apple Music & Custom Solutions, but is not endorsed or certified. TOMO Music is a music discovery and rating app. This app does not stream music and is not affiliated with or endorsed by any music corporation or streaming services.
                        </Text>
                    </View>
                </View>

                <View style={[styles.section, { marginTop: 20, marginBottom: 40 }]}>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}><Text style={styles.logoutText}>Log Out</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}><Text style={styles.deleteText}>Delete Account</Text></TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F2F2F2' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', backgroundColor: '#F2F2F2' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#000' },
    saveText: { fontSize: 18, color: '#D4AF37', fontWeight: 'bold' },
    scrollContent: { padding: 20 },
    photoSection: { alignItems: 'center', marginBottom: 30 },
    profilePhoto: { width: 100, height: 100, borderRadius: 50, marginBottom: 10, borderWidth: 2, borderColor: '#D4AF37' },
    changePhotoText: { color: '#D4AF37', fontSize: 16, fontWeight: 'bold' },
    section: { marginBottom: 25 },
    label: { color: '#555', marginBottom: 8, fontWeight: 'bold', fontSize: 14 },
    input: { backgroundColor: '#fff', color: '#000', borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#ddd', marginBottom: 15 },
    readOnlyInput: { backgroundColor: '#EFEFEF', color: '#888', borderColor: '#ccc' },
    textArea: { height: 80, textAlignVertical: 'top' },
    pickerWrapper: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
    picker: { color: '#000' },
    separator: { height: 1, backgroundColor: '#ddd', marginVertical: 10, marginBottom: 25 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
    statItem: { alignItems: 'center' },
    statNum: { color: '#000', fontSize: 20, fontWeight: 'bold' },
    statLabel: { color: '#555', fontSize: 14 },
    outlineButton: { borderWidth: 1, borderColor: '#D4AF37', padding: 10, borderRadius: 8, alignItems: 'center' },
    outlineButtonText: { color: '#D4AF37', fontWeight: 'bold' },
    topFriendsGrid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    topFriendItemGrid: { alignItems: 'center', width: '23%', position: 'relative' },
    topFriendName: { color: '#333', fontSize: 10, marginTop: 4, textAlign: 'center' },
    topFriendImg: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: '#ddd' },
    removeFriendBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: 'red', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    friendRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    friendListImg: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
    friendListname: { color: '#000', fontSize: 16, flex: 1 },
    followBtn: { backgroundColor: '#000', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
    topFriendBtn: { backgroundColor: '#F2F2F2', borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    top8Item: { marginRight: 10, position: 'relative' },
    top8Image: { width: 70, height: 70, borderRadius: 5 },
    removeBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    passwordButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 25 },
    passwordButtonText: { color: '#000', fontSize: 16 },
    searchModalContainer: { flex: 1, backgroundColor: '#F2F2F2' },
    searchHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#ddd', marginTop: Platform.OS === 'ios' ? 20 : 15, paddingTop: Platform.OS === 'android' ? 20 : 0, backgroundColor: '#fff' },
    closeButton: { paddingRight: 10, minWidth: 40, justifyContent: 'center', alignItems: 'center' },
    searchInput: { flex: 1, backgroundColor: '#F9F9F9', color: '#000', borderRadius: 8, padding: 10, fontSize: 16, marginLeft: 5, borderWidth: 1, borderColor: '#eee' },
    searchItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
    searchPoster: { width: 45, height: 45, borderRadius: 4, marginRight: 10 },
    searchTitle: { color: '#000', fontSize: 16, fontWeight: 'bold' },
    searchSubtitle: { color: '#555', fontSize: 14 },
    logoutButton: { backgroundColor: '#fff', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
    logoutText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
    deleteButton: { padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 5 },
    deleteText: { color: '#FF4444', fontWeight: 'bold', fontSize: 15 },
    aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    aboutText: { color: '#333', fontSize: 16 },
});

export default ProfileSettings;
