import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { searchMusic, formatArtworkUrl, addCuration } from '../api/MusicService';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CreateCurationScreen = ({ navigation }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedAlbums, setSelectedAlbums] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const results = await searchMusic(searchQuery);
            setSearchResults(results.slice(0, 5)); // Limit to 5 results for brevity
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const toggleAlbumSelection = (album) => {
        if (selectedAlbums.some(a => a.id === album.id)) {
            setSelectedAlbums(prev => prev.filter(a => a.id !== album.id));
        } else {
            if (selectedAlbums.length >= 8) {
                Alert.alert("Limit Reached", "You can only add up to 8 albums.");
                return;
            }
            setSelectedAlbums(prev => [...prev, album]);
        }
    };

    const handlePublish = async () => {
        if (!title.trim() || selectedAlbums.length === 0) {
            Alert.alert("Missing Info", "Please add a title and at least one album.");
            return;
        }

        setIsPublishing(true);
        try {
            const user = auth.currentUser;
            let userProfile = { name: "User", username: "user", profilePhoto: null };

            if (user) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    userProfile = userDoc.data();
                }
            }

            const newCuration = {
                title,
                description,
                albums: selectedAlbums,
                userId: user.uid,
                username: userProfile.username || "user",
                userPhoto: userProfile.profilePhoto || null,
                timestamp: serverTimestamp(),
                likes: 0,
                likedBy: []
            };

            await addCuration(newCuration);
            Alert.alert("Success", "Curation published!", [
                { text: "OK", onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error("Error publishing:", error);
            Alert.alert("Error", "Could not publish curation.");
        } finally {
            setIsPublishing(false);
        }
    };

    const renderSearchItem = ({ item }) => {
        const isSelected = selectedAlbums.some(a => a.id === item.id);
        const imageUrl = item.attributes?.artwork?.url ? formatArtworkUrl(item.attributes.artwork.url, 100, 100) : null;

        return (
            <TouchableOpacity onPress={() => toggleAlbumSelection(item)} style={[styles.searchItem, isSelected && styles.searchItemSelected]}>
                <Image source={{ uri: imageUrl }} style={styles.searchItemImage} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.searchItemTitle} numberOfLines={1}>{item.attributes?.name}</Text>
                    <Text style={styles.searchItemArtist} numberOfLines={1}>{item.attributes?.artistName}</Text>
                </View>
                <Icon name={isSelected ? "check-circle" : "plus-circle"} size={24} color={isSelected ? "#d4a03e" : "#ccc"} />
            </TouchableOpacity>
        );
    };

    const renderSelectedItem = ({ item }) => (
        <View style={styles.selectedItem}>
            <Image source={{ uri: formatArtworkUrl(item.attributes.artwork.url, 150, 150) }} style={styles.selectedItemImage} />
            <TouchableOpacity style={styles.removeButton} onPress={() => toggleAlbumSelection(item)}>
                <Icon name="times" size={12} color="#fff" />
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
                    <Icon name="arrow-left" size={20} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Curation</Text>
                <TouchableOpacity
                    onPress={handlePublish}
                    disabled={isPublishing}
                    style={{ padding: 10, opacity: isPublishing ? 0.5 : 1 }}
                >
                    <Text style={styles.publishText}>{isPublishing ? "..." : "Publish"}</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.titleInput}
                        placeholder="Title (e.g., Weekly Picks)"
                        placeholderTextColor="#999"
                        value={title}
                        onChangeText={setTitle}
                        maxLength={50}
                    />
                    <TextInput
                        style={styles.descInput}
                        placeholder="Description (optional)"
                        placeholderTextColor="#999"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        maxLength={200}
                    />
                </View>

                {/* Selected Albums Preview */}
                {selectedAlbums.length > 0 && (
                    <View style={styles.selectionContainer}>
                        <Text style={styles.sectionLabel}>Selected ({selectedAlbums.length}/8)</Text>
                        <FlatList
                            data={selectedAlbums}
                            horizontal
                            renderItem={renderSelectedItem}
                            keyExtractor={item => item.id}
                            style={{ marginTop: 10 }}
                            showsHorizontalScrollIndicator={false}
                        />
                    </View>
                )}

                {/* Album Search */}
                <View style={styles.searchContainer}>
                    <Text style={styles.sectionLabel}>Add Albums</Text>
                    <View style={styles.searchBar}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search Apple Music..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSearch}
                            returnKeyType="search"
                        />
                        <TouchableOpacity onPress={handleSearch} style={{ padding: 5 }}>
                            <Icon name="search" size={20} color="#d4a03e" />
                        </TouchableOpacity>
                    </View>

                    {isSearching ? (
                        <ActivityIndicator color="#d4a03e" style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={searchResults}
                            renderItem={renderSearchItem}
                            keyExtractor={item => item.id}
                            style={styles.resultsList}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        />
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2',
        paddingTop: Platform.OS === 'android' ? 25 : 0
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000'
    },
    publishText: {
        color: '#d4a03e',
        fontWeight: 'bold',
        fontSize: 16
    },
    inputContainer: {
        padding: 20,
        backgroundColor: '#fff',
        marginBottom: 10
    },
    titleInput: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingVertical: 5
    },
    descInput: {
        fontSize: 16,
        color: '#333',
        minHeight: 60,
        textAlignVertical: 'top'
    },
    selectionContainer: {
        padding: 15,
        backgroundColor: '#fff',
        marginBottom: 10
    },
    sectionLabel: {
        fontSize: 14,
        color: '#666',
        fontWeight: '600',
        textTransform: 'uppercase'
    },
    selectedItem: {
        marginRight: 10,
        position: 'relative',
        width: 70
    },
    selectedItemImage: {
        width: 70,
        height: 70,
        borderRadius: 8
    },
    removeButton: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: 'red',
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#fff'
    },
    searchContainer: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 15
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9F9F9',
        borderRadius: 8,
        paddingHorizontal: 10,
        marginTop: 10,
        height: 40,
        borderWidth: 1,
        borderColor: '#eee'
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#000'
    },
    resultsList: {
        marginTop: 10
    },
    searchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0'
    },
    searchItemSelected: {
        backgroundColor: '#fff8e1'
    },
    searchItemImage: {
        width: 50,
        height: 50,
        borderRadius: 4,
        marginRight: 10,
        backgroundColor: '#eee'
    },
    searchItemTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000'
    },
    searchItemArtist: {
        fontSize: 12,
        color: '#666'
    }
});

export default CreateCurationScreen;
