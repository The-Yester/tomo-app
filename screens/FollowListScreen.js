import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Icon from 'react-native-vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';

const FollowListScreen = ({ route, navigation }) => {
    const { title, userList, currentUserId, isOwnFollowers, isOwnFollowing } = route.params;

    // Deduplicate userList to prevent "same key" warning
    const uniqueUserList = React.useMemo(() => {
        const list = userList || [];
        const seen = new Set();
        return list.filter(item => {
            if (seen.has(item.uid)) {
                return false;
            }
            seen.add(item.uid);
            return true;
        });
    }, [userList]);

    const [listData, setListData] = useState(uniqueUserList);
    const [loading, setLoading] = useState(false);

    // Hydrate list with fresh data (Profile Photos might be stale in the array)
    useEffect(() => {
        const fetchLatestProfiles = async () => {
            const hydratedList = await Promise.all(uniqueUserList.map(async (user) => {
                try {
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        return { ...user, profilePhoto: data.profilePhoto, username: data.username };
                    }
                    return user;
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                    return user;
                }
            }));
            setListData(hydratedList);
        };

        fetchLatestProfiles();
    }, [uniqueUserList]);

    // We might want to refresh this data or fetch 'isFollowing' status for each if viewing someone else's list.
    // For now, simple list view.

    const handleRemoveFollower = async (follower) => {
        Alert.alert(
            "Remove Follower",
            `Are you sure you want to remove ${follower.username} as a follower?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const currentUserRef = doc(db, "users", currentUserId);
                            const followerRef = doc(db, "users", follower.uid);

                            // 1. Remove from my 'followers' list
                            const userSnap = await getDoc(currentUserRef);
                            if (!userSnap.exists()) return;

                            const currentFollowers = userSnap.data().followers || [];
                            const newFollowers = currentFollowers.filter(f => f.uid !== follower.uid);

                            await updateDoc(currentUserRef, { followers: newFollowers });

                            // 2. Remove me from their 'following' list
                            const followerSnap = await getDoc(followerRef);
                            if (followerSnap.exists()) {
                                const theirFollowing = followerSnap.data().following || [];
                                const newTheirFollowing = theirFollowing.filter(f => f.uid !== currentUserId);
                                await updateDoc(followerRef, { following: newTheirFollowing });
                            }

                            // 3. Update UI
                            setListData(prev => prev.filter(item => item.uid !== follower.uid));

                        } catch (error) {
                            console.error("Error removing follower:", error);
                            Alert.alert("Error", "Could not remove follower.");
                        }
                    }
                }
            ]
        );
    };

    const handleUnfollow = async (targetUser) => {
        Alert.alert(
            "Unfollow",
            `Are you sure you want to unfollow ${targetUser.username}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Unfollow",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const currentUserRef = doc(db, "users", currentUserId);
                            const targetRef = doc(db, "users", targetUser.uid);

                            // 1. Remove from my 'following' list
                            const userSnap = await getDoc(currentUserRef);
                            if (!userSnap.exists()) return;

                            const currentFollowing = userSnap.data().following || [];
                            const newFollowing = currentFollowing.filter(f => f.uid !== targetUser.uid);

                            await updateDoc(currentUserRef, { following: newFollowing });

                            // 2. Remove me from their 'followers' list
                            const targetSnap = await getDoc(targetRef);
                            if (targetSnap.exists()) {
                                const theirFollowers = targetSnap.data().followers || [];
                                const newTheirFollowers = theirFollowers.filter(f => f.uid !== currentUserId);
                                await updateDoc(targetRef, { followers: newTheirFollowers });
                            }

                            // 3. Update UI
                            setListData(prev => prev.filter(item => item.uid !== targetUser.uid));

                        } catch (error) {
                            console.error("Error unfollowing:", error);
                            Alert.alert("Error", "Could not unfollow.");
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-left" size={24} color="#ff8c00" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{title}</Text>
                <View style={{ width: 24 }} />
            </View>

            <FlatList
                data={listData}
                keyExtractor={(item) => item.uid}
                renderItem={({ item }) => (
                    <View style={styles.userRow}>
                        <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                            onPress={() => navigation.navigate('PublicProfile', { userId: item.uid })}
                        >
                            <Image
                                source={item.profilePhoto ? { uri: item.profilePhoto } : require('../assets/profile_placeholder.jpg')}
                                style={styles.avatar}
                            />
                            <Text style={styles.username}>{item.username}</Text>
                        </TouchableOpacity>

                        {isOwnFollowers && (
                            <TouchableOpacity onPress={() => handleRemoveFollower(item)} style={styles.removeButton}>
                                <Text style={styles.removeButtonText}>Remove</Text>
                            </TouchableOpacity>
                        )}

                        {isOwnFollowing && (
                            <TouchableOpacity onPress={() => handleUnfollow(item)} style={styles.removeButton}>
                                <Text style={styles.removeButtonText}>Unfollow</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
                contentContainerStyle={{ padding: 20 }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2', // Light Theme
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#F2F2F2',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0'
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginRight: 15,
        borderWidth: 1,
        borderColor: '#C6A87C' // Gold border
    },
    username: {
        fontSize: 16,
        color: '#000',
        fontWeight: 'bold'
    },
    emptyText: {
        color: '#666',
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 20
    },
    removeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#C6A87C',
        backgroundColor: '#fff'
    },
    removeButtonText: {
        color: '#C6A87C',
        fontSize: 12,
        fontWeight: 'bold'
    }
});

export default FollowListScreen;
