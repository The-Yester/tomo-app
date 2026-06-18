import React, { useState, useContext, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    TouchableOpacity,
    TextInput,
    SafeAreaView,
    Platform,
    StatusBar,
    ActivityIndicator,
    ScrollView
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MusicContext } from '../context/MusicContext';
import { searchMusic, formatArtworkUrl } from '../api/MusicService';
import Icon from 'react-native-vector-icons/FontAwesome';
import { debounce } from 'lodash';

const PhysicalCollectionScreen = () => {
    const navigation = useNavigation();
    const { physicalCollection, overallRatedAlbums, ratingMethod } = useContext(MusicContext);

    const [activeTab, setActiveTab] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [loadingSearch, setLoadingSearch] = useState(false);

    // Derived Statistics
    const stats = useMemo(() => {
        const counts = { All: 0, Vinyl: 0, CD: 0, Cassette: 0 };
        physicalCollection.forEach(item => {
            counts.All++;
            if (counts[item.format] !== undefined) {
                counts[item.format]++;
            }
        });
        return counts;
    }, [physicalCollection]);

    // Filtered Collection
    const filteredCollection = useMemo(() => {
        let collection = physicalCollection;
        if (activeTab !== 'All') {
            collection = physicalCollection.filter(item => item.format === activeTab);
        }
        // Sort alphabetically by artist name
        return [...collection].sort((a, b) => {
            const artistA = (a.artistName || '').toLowerCase();
            const artistB = (b.artistName || '').toLowerCase();
            return artistA.localeCompare(artistB);
        });
    }, [physicalCollection, activeTab]);

    // --- Search Logic Reused from SearchScreenMusic ---
    const fetchResults = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            setLoadingSearch(false);
            return;
        }
        setLoadingSearch(true);
        try {
            const data = await searchMusic(query);
            // Filter out purely artists for this specific view to focus on albums
            setSearchResults(data.filter(item => item.type !== 'artists'));
            setLoadingSearch(false);
        } catch (error) {
            if (error.name === 'AbortError') {
                return; // Silence abort errors
            }
            console.error("Error searching:", error);
            setLoadingSearch(false);
        }
    };

    const debouncedSearch = useCallback(
        debounce((text) => fetchResults(text), 400),
        []
    );

    const handleSearchChange = (text) => {
        setSearchQuery(text);
        if (text.length > 0) {
            setIsSearching(true);
            setLoadingSearch(true);
            debouncedSearch(text);
        } else {
            setIsSearching(false);
            setSearchResults([]);
            setLoadingSearch(false);
            debouncedSearch.cancel();
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setIsSearching(false);
        setSearchResults([]);
        setLoadingSearch(false);
        debouncedSearch.cancel();
    };

    // --- Renderers ---
    const renderCollectionItem = ({ item }) => {
        const ratingObj = overallRatedAlbums.find(a => String(a.id) === String(item.id));
        let displayRating = '—';
        if (ratingObj?.userOverallRating) {
            const parsed = parseFloat(ratingObj.userOverallRating);
            if (ratingMethod === 'Percentage') {
                displayRating = parsed % 1 === 0 ? `${parsed}%` : `${parsed.toFixed(1)}%`;
            } else {
                displayRating = parsed.toFixed(1);
            }
        }

        let formatIcon = 'circle-o';
        if (item.format === 'Vinyl') formatIcon = 'dot-circle-o';
        if (item.format === 'CD') formatIcon = 'bullseye';
        if (item.format === 'Cassette') formatIcon = 'ticket';

        const imageUrl = item.artwork?.url
            ? formatArtworkUrl(item.artwork.url, 200, 200)
            : 'https://via.placeholder.com/150';

        return (
            <TouchableOpacity
                style={styles.collectionCard}
                onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id })}
            >
                <Image source={{ uri: imageUrl }} style={styles.albumArt} />
                <View style={styles.cardInfo}>
                    <Text style={styles.albumName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.artistName} numberOfLines={1}>{item.artistName}</Text>
                    <View style={styles.badgesRow}>
                        <View style={styles.formatBadge}>
                            <Icon name={formatIcon} size={12} color="#fff" style={{ marginRight: 4 }} />
                            <Text style={styles.formatText}>{item.format}</Text>
                        </View>
                        <View style={styles.ratingBadge}>
                            <Icon name="star" size={12} color="#ff8c00" style={{ marginRight: 4 }} />
                            <Text style={styles.ratingText}>{displayRating}</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderSearchResult = ({ item }) => {
        const imageUrl = item.attributes?.artwork?.url
            ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
            : 'https://via.placeholder.com/150';

        return (
            <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
            >
                <Image source={{ uri: imageUrl }} style={styles.searchAlbumArt} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>{item.attributes?.name || item.title}</Text>
                    <Text style={styles.searchResultSubtitle} numberOfLines={1}>{item.attributes?.artistName}</Text>
                </View>
                <Icon name="chevron-right" size={14} color="#666" />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="chevron-left" size={20} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Physical Collection</Text>
                <View style={{ width: 20 }} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Icon name="search" size={16} color="#888" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search music to add..."
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={handleSearchChange}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={clearSearch}>
                        <Icon name="times-circle" size={18} color="#888" />
                    </TouchableOpacity>
                )}
            </View>

            {isSearching ? (
                <View style={styles.mainContent}>
                    {loadingSearch ? (
                        <ActivityIndicator size="large" color="#ff8c00" style={{ marginTop: 50 }} />
                    ) : (
                        <FlatList
                            data={searchResults}
                            keyExtractor={item => item.id.toString()}
                            renderItem={renderSearchResult}
                            contentContainerStyle={{ padding: 20 }}
                            ListEmptyComponent={<Text style={styles.emptyText}>No albums found.</Text>}
                        />
                    )}
                </View>
            ) : (
                <View style={styles.mainContent}>
                    {/* Format Toggles with Live Stats */}
                    <View style={styles.togglesContainer}>
                        {['All', 'Vinyl', 'CD', 'Cassette'].map(tab => {
                            const isActive = activeTab === tab;
                            return (
                                <TouchableOpacity
                                    key={tab}
                                    style={[styles.toggleBadge, isActive && styles.activeToggleBadge]}
                                    onPress={() => setActiveTab(tab)}
                                >
                                    <Text style={[styles.toggleText, isActive && styles.activeToggleText]} numberOfLines={1}>
                                        {tab} ({stats[tab]})
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Collection List */}
                    <FlatList
                        data={filteredCollection}
                        keyExtractor={item => `${item.id}_${item.format}`}
                        renderItem={renderCollectionItem}
                        contentContainerStyle={styles.listContainer}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Icon name="archive" size={50} color="#ddd" style={{ marginBottom: 10 }} />
                                <Text style={styles.emptyText}>No physical media found.</Text>
                                <Text style={styles.emptySubText}>Use the search bar above to start logging your records, CDs, and tapes.</Text>
                            </View>
                        }
                    />
                </View>
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        margin: 20,
        marginBottom: 10,
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 45,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#000',
    },
    mainContent: {
        flex: 1,
    },
    togglesContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 10,
        marginBottom: 10,
        gap: 6
    },
    toggleBadge: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#e0e0e0',
        borderWidth: 1,
        borderColor: '#ccc',
    },
    activeToggleBadge: {
        backgroundColor: '#ff8c00',
        borderColor: '#e87c00',
    },
    toggleText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
    },
    activeToggleText: {
        color: '#fff',
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    collectionCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 10,
        marginBottom: 15,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    albumArt: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: '#eaeaea'
    },
    cardInfo: {
        flex: 1,
        marginLeft: 15,
        justifyContent: 'center',
    },
    albumName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 4,
    },
    artistName: {
        fontSize: 14,
        color: '#666',
        marginBottom: 10,
    },
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    formatBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2E8B57', // Sea Green
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    formatText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    ratingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff8e1', // Light Gold
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ffe082'
    },
    ratingText: {
        color: '#ff8c00',
        fontSize: 12,
        fontWeight: 'bold',
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginBottom: 10,
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    searchAlbumArt: {
        width: 50,
        height: 50,
        borderRadius: 5,
        marginRight: 15,
        backgroundColor: '#DDD'
    },
    searchResultTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 4
    },
    searchResultSubtitle: {
        fontSize: 14,
        color: '#666'
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 50,
        paddingHorizontal: 30,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#666',
        marginBottom: 10,
    },
    emptySubText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        lineHeight: 20,
    }
});

export default PhysicalCollectionScreen;
