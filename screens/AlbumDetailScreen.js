import React, { useState, useContext, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Button,
    StyleSheet,
    Image,
    TouchableOpacity,
    Modal,
    TextInput,
    Alert,
    FlatList,
    ScrollView,
    Platform,
    StatusBar,
    SafeAreaView,
    KeyboardAvoidingView,
    Animated
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MusicContext } from '../context/MusicContext';
import { getAlbumDetails, formatArtworkUrl } from '../api/MusicService';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import PizzaRating from '../context/PizzaRating';
import AwardsRating from '../context/AwardsRating';
import PercentageRating from '../context/PercentageRating';
import ClassicRating from '../context/ClassicRating';


const AlbumDetailScreen = ({ route }) => {
    const navigation = useNavigation();
    const { ratingMethod, addAlbumToList, addToRecentlyPlayed, addToRecentActivity, submitRating, musicLists } = useContext(MusicContext);
    const [userRating, setUserRating] = useState(0);
    const [awardsDetails, setAwardsDetails] = useState(null);
    const { albumId, album: initialAlbum } = route.params;
    const [album, setAlbum] = useState(initialAlbum || null);
    const [ratingModalVisible, setRatingModalVisible] = useState(false);
    const [addToListModalVisible, setAddToListModalVisible] = useState(false);
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [isPlayed, setIsPlayed] = useState(false); // Default to FALSE

    const [reviewText, setReviewText] = useState('');
    const [reviews, setReviews] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const [globalStats, setGlobalStats] = useState(null);

    // Toast State
    const [toastMessage, setToastMessage] = useState('');
    const toastOpacity = useRef(new Animated.Value(0)).current;

    const showToast = (message) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.delay(2000),
            Animated.timing(toastOpacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            })
        ]).start();
    };

    useEffect(() => {
        const fetchAlbumData = async () => {
            if (!albumId) {
                setLoading(false);
                return;
            }
            try {
                if (!album) {
                    setLoading(true);
                }
                const data = await getAlbumDetails(albumId);
                setAlbum(prev => ({ ...prev, ...data }));
            } catch (error) {
                console.error("Error fetching album details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAlbumData();
    }, [albumId]);

    // Real-time Global Stats Listener
    useEffect(() => {
        if (!albumId) return;
        const sub = onSnapshot(doc(db, "albums", albumId.toString()), (docSnap) => {
            if (docSnap.exists() && docSnap.data().stats) {
                setGlobalStats(docSnap.data().stats);
            }
        });
        return () => sub();
    }, [albumId]);

    const handleRatingSubmit = async (selectedRating, details = null) => {
        if (!album) return;

        try {
            const ratingValue = parseFloat(selectedRating);
            // Validation logic similar to movies...

            setUserRating(ratingValue);
            setRatingModalVisible(false);

            const albumInfoForContext = {
                attributes: {
                    name: album.attributes?.name || album.title,
                    artistName: album.attributes?.artistName || album.artistName,
                    artwork: album.attributes?.artwork,
                    releaseDate: album.attributes?.releaseDate
                }
            };

            await submitRating(albumId, ratingMethod, ratingValue, details, albumInfoForContext);

            const activityItem = {
                id: album.id,
                attributes: {
                    name: albumInfoForContext.attributes.name,
                    artistName: albumInfoForContext.attributes.artistName,
                    artwork: albumInfoForContext.attributes.artwork,
                    releaseDate: albumInfoForContext.attributes.releaseDate
                },
                userRating: ratingValue,
                ratingMethod: ratingMethod
            };

            if (isPlayed) {
                addToRecentlyPlayed(activityItem);
            } else {
                addToRecentActivity(activityItem);
            }

            Alert.alert("Success", "Rating saved!");
        } catch (error) {
            console.error("Error saving rating:", error);
            Alert.alert("Error", "Failed to save rating.");
        }
    };

    // Tracks Render
    const renderTrackItem = ({ item, index }) => (
        <View style={styles.trackItem}>
            <Text style={styles.trackNumber}>{index + 1}</Text>
            <View style={{ flex: 1 }}>
                <Text style={styles.trackName}>{item.attributes.name}</Text>
                <Text style={styles.trackArtist}>{item.attributes.artistName}</Text>
            </View>
            <Text style={styles.trackDuration}>
                {item.attributes.durationInMillis ? `${Math.floor(item.attributes.durationInMillis / 60000)}:${((item.attributes.durationInMillis % 60000) / 1000).toFixed(0).padStart(2, '0')}` : ''}
            </Text>
        </View>
    );

    if (loading && !album) return <View style={styles.container}><Text>Loading...</Text></View>;
    if (!album) return <View style={styles.container}><Text>Album not found.</Text></View>;

    const artworkUrl = album.attributes?.artwork?.url
        ? formatArtworkUrl(album.attributes.artwork.url, 500, 500)
        : 'https://via.placeholder.com/300';

    return (
        <SafeAreaView style={styles.container}>
            {/* Custom Back Button Header */}
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="chevron-left" size={20} color="#333" />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
            </View>

            <ScrollView>
                <View style={styles.headerContentContainer}>
                    <Image source={{ uri: artworkUrl }} style={styles.coverArt} resizeMode="contain" />
                    <View style={styles.detailsContainer}>
                        <Text style={styles.title}>{album.attributes?.name || album.title}</Text>
                        <TouchableOpacity onPress={() => navigation.push('ArtistDetail', { artistName: album.attributes?.artistName, artistId: 'mock-artist-id' })}>
                            <Text style={styles.artist}>{album.attributes?.artistName}</Text>
                        </TouchableOpacity>
                        <Text style={styles.info}>{album.attributes?.genreNames?.[0]} • {album.attributes?.releaseDate?.substring(0, 4)}</Text>

                        {album.attributes?.editorialNotes?.short && (
                            <Text style={styles.description}>{album.attributes.editorialNotes.short}</Text>
                        )}

                        <View style={styles.buttonGrid}>
                            <TouchableOpacity style={[styles.gridButton, { backgroundColor: '#e50914' }]} onPress={() => setRatingModalVisible(true)}>
                                <Icon name="star" size={16} color="white" style={{ marginRight: 8 }} />
                                <Text style={styles.gridButtonText}>Rate</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.gridButton, { backgroundColor: '#ff8c00' }]}
                                onPress={() => {
                                    if (album) {
                                        addAlbumToList(1, album);
                                        showToast("Added to Favorites");
                                    }
                                }}
                            >
                                <Icon name="heart" size={16} color="white" style={{ marginRight: 8 }} />
                                <Text style={styles.gridButtonText}>Favorites</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.gridButton, { backgroundColor: '#4682b4' }]}
                                onPress={() => {
                                    if (album) {
                                        addAlbumToList(2, album);
                                        showToast("Added to Listen Later");
                                    }
                                }}
                            >
                                <Icon name="bookmark" size={16} color="white" style={{ marginRight: 8 }} />
                                <Text style={styles.gridButtonText}>Listen Later</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ width: '100%', alignItems: 'center', marginTop: 10 }}>
                            <TouchableOpacity
                                style={[styles.listButton]}
                                onPress={() => setAddToListModalVisible(true)}
                            >
                                <Icon name="list" size={16} color="#333" style={{ marginRight: 8 }} />
                                <Text style={styles.listButtonText}>Add to List</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View style={styles.tracksSection}>
                    <Text style={styles.sectionTitle}>Tracks</Text>
                    {album.relationships?.tracks?.data ? (
                        <FlatList
                            data={album.relationships.tracks.data}
                            renderItem={renderTrackItem}
                            keyExtractor={item => item.id}
                            scrollEnabled={false}
                        />
                    ) : (
                        <Text style={styles.emptyText}>No track list available.</Text>
                    )}
                </View>
            </ScrollView>

            {/* Rating Modal */}
            <Modal animationType="slide" transparent={true} visible={ratingModalVisible} onRequestClose={() => { setRatingModalVisible(false); setIsPlayed(false); }}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        {!['1-10', '1-5', 'Percentage'].includes(ratingMethod) && (
                            <Text style={styles.modalTitle}>Rate {album.attributes?.name}</Text>
                        )}

                        {/* Rating Components Logic same as MovieDetail */}
                        {ratingMethod === '1-5' && (
                            <PizzaRating
                                initialRating={userRating}
                                onSubmitRating={(rating) => handleRatingSubmit(rating)}
                                onCancel={() => { setRatingModalVisible(false); setIsPlayed(false); }}
                                artistName={album.attributes?.artistName || album.artistName}
                                albumArtwork={artworkUrl}
                                isPlayed={isPlayed}
                                onTogglePlayed={() => setIsPlayed(!isPlayed)}
                            />
                        )}
                        {ratingMethod === '1-10' && (
                            <ClassicRating
                                initialRating={userRating}
                                onSubmitRating={(rating) => handleRatingSubmit(rating)}
                                onCancel={() => { setRatingModalVisible(false); setIsPlayed(false); }}
                                artistName={album.attributes?.artistName || album.artistName}
                                albumArtwork={artworkUrl}
                                isPlayed={isPlayed}
                                onTogglePlayed={() => setIsPlayed(!isPlayed)}
                            />
                        )}
                        {ratingMethod === 'Percentage' && (
                            <PercentageRating
                                value={userRating}
                                onChange={(rating) => handleRatingSubmit(rating)}
                                onCancel={() => { setRatingModalVisible(false); setIsPlayed(false); }}
                                artistName={album.attributes?.artistName || album.artistName}
                                albumArtwork={artworkUrl}
                                isPlayed={isPlayed}
                                onTogglePlayed={() => setIsPlayed(!isPlayed)}
                            />
                        )}

                        {ratingMethod === 'Awards' && (
                            <View style={{ width: '100%', height: 600, alignItems: 'stretch' }}>
                                <AwardsRating
                                    initialRatings={awardsDetails || {}}
                                    onChange={(avg, details) => {
                                        setUserRating(avg);
                                        setAwardsDetails(details);
                                    }}
                                    isPlayed={isPlayed}
                                    onTogglePlayed={() => setIsPlayed(!isPlayed)}
                                />
                                <TouchableOpacity
                                    style={[styles.modalSecondaryButton, { alignSelf: 'center', backgroundColor: '#d4a03e', borderRadius: 20, marginTop: 15, paddingHorizontal: 30 }]}
                                    onPress={() => handleRatingSubmit(userRating, awardsDetails)}
                                >
                                    <Text style={[styles.modalSecondaryButtonText, { color: 'white', fontWeight: 'bold' }]}>Submit Rating</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {!['1-10', '1-5', 'Percentage'].includes(ratingMethod) && (
                            <TouchableOpacity style={[styles.modalSecondaryButton, { marginTop: 20 }]} onPress={() => { setRatingModalVisible(false); setIsPlayed(false); }}>
                                <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Add to List Modal */}
            <Modal animationType="slide" transparent={true} visible={addToListModalVisible} onRequestClose={() => setAddToListModalVisible(false)}>
                <View style={[styles.modalContainer, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View style={[styles.modalContent, { width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 40 }]}>
                        <Text style={styles.modalTitle}>Add to List</Text>

                        <ScrollView style={{ width: '100%', maxHeight: 400 }}>
                            {musicLists.map((list) => (
                                <TouchableOpacity
                                    key={list.id}
                                    style={styles.listItemBtn}
                                    onPress={() => {
                                        if (album) {
                                            addAlbumToList(list.id, album);
                                            setAddToListModalVisible(false);
                                            showToast(`Added to ${list.name}`);
                                        }
                                    }}
                                >
                                    <Text style={styles.listItemBtnText}>{list.name}</Text>
                                    <Icon name="plus" size={16} color="#ff8c00" />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity style={[styles.modalSecondaryButton, { marginTop: 20, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 40 }]} onPress={() => setAddToListModalVisible(false)}>
                            <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Toast */}
            <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
                <Text style={styles.toastText}>{toastMessage}</Text>
            </Animated.View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    navBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#fff',
        width: '100%',
        zIndex: 10,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backText: {
        fontSize: 16,
        color: '#333',
        marginLeft: 8,
        fontWeight: '600',
    },
    headerContentContainer: {
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    coverArt: {
        width: 200,
        height: 200,
        borderRadius: 10,
        marginBottom: 15,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    detailsContainer: {
        alignItems: 'center',
        width: '100%'
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 5,
        color: '#333'
    },
    artist: {
        fontSize: 18,
        color: '#ff8c00',
        marginBottom: 5,
        fontWeight: '600'
    },
    info: {
        fontSize: 14,
        color: '#888',
        marginBottom: 15
    },
    description: {
        fontSize: 14,
        color: '#444',
        textAlign: 'center',
        fontStyle: 'italic',
        marginBottom: 20,
        paddingHorizontal: 10
    },
    buttonGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10
    },
    gridButton: {
        flexDirection: 'row',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
        alignItems: 'center',
        minWidth: 100,
        justifyContent: 'center'
    },
    gridButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12
    },
    tracksSection: {
        padding: 20,
        backgroundColor: '#fff',
        marginTop: 10
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#333'
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0'
    },
    trackNumber: {
        width: 30,
        fontSize: 14,
        color: '#888',
        fontWeight: 'bold'
    },
    trackName: {
        fontSize: 16,
        color: '#333',
        marginBottom: 2
    },
    trackArtist: {
        fontSize: 12,
        color: '#888'
    },
    trackDuration: {
        fontSize: 12,
        color: '#666'
    },
    emptyText: {
        fontStyle: 'italic',
        color: '#999'
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        width: '95%',
        maxHeight: '90%'
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20
    },
    modalSecondaryButton: {
        padding: 10
    },
    modalSecondaryButtonText: {
        color: '#666',
        fontSize: 16
    },
    toast: {
        position: 'absolute',
        bottom: 50,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    toastText: {
        color: '#fff',
        fontWeight: 'bold'
    },
    listButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 25,
    },
    listButtonText: {
        color: '#333',
        fontWeight: '600',
        fontSize: 14
    },
    listItemBtn: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        width: '100%'
    },
    listItemBtnText: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500'
    }
});

export default AlbumDetailScreen;
