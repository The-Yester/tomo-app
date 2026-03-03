import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Image,
    Platform,
    StatusBar,
    ActivityIndicator,
    SafeAreaView,
    Dimensions
} from 'react-native';
import { searchMusic, formatArtworkUrl } from '../api/MusicService';
import { debounce } from 'lodash';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SearchScreenMusic = () => {
    const navigation = useNavigation();
    const [query, setQuery] = useState('');
    const [genres] = useState(MUSIC_GENRES);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchResults = async (searchQuery) => {
        if (!searchQuery.trim()) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await searchMusic(searchQuery);
            setResults(data);
        } catch (error) {
            console.error("Error searching:", error);
        } finally {
            setLoading(false);
        }
    };

    const debouncedSearch = useCallback(
        debounce((text) => fetchResults(text), 400),
        []
    );

    const handleTextChange = (text) => {
        setQuery(text);
        if (text.length > 0) {
            setLoading(true);
        }
        debouncedSearch(text);
    };

    const renderResultItem = ({ item }) => {
        const imageUrl = item.attributes?.artwork?.url
            ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
            : 'https://via.placeholder.com/150';

        return (
            <TouchableOpacity
                style={styles.resultItem}
                onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
            >
                <Image
                    source={{ uri: imageUrl }}
                    style={styles.albumArt}
                />
                <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle}>{item.attributes?.name || item.title}</Text>
                    <Text style={styles.resultSubtitle}>
                        {item.attributes?.artistName || 'Unknown Artist'} • {item.attributes?.releaseDate?.substring(0, 4)}
                    </Text>
                </View>
                <Icon name="chevron-right" size={14} color="#666" />
            </TouchableOpacity>
        );
    };

    const renderFooter = () => (
        <View style={styles.attributionContainer}>
            <Text style={styles.attributionText}>Data provided by Apple Music.</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Search Music</Text>
            </View>

            <View style={styles.searchBarContainer}>
                <View style={styles.searchBar}>
                    <Icon name="search" size={18} color="#888" style={styles.searchIcon} />
                    <TextInput
                        style={styles.textInput}
                        placeholder="Search Albums & Artists"
                        placeholderTextColor="#666"
                        onChangeText={handleTextChange}
                        value={query}
                        autoCapitalize="none"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => handleTextChange('')}>
                            <Icon name="times-circle" size={18} color="#888" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {loading ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#d4a03e" />
                </View>
            ) : query.length > 0 ? (
                <FlatList
                    data={results}
                    renderItem={renderResultItem}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.centerContent}>
                            <Text style={styles.emptyText}>No results found.</Text>
                        </View>
                    }
                    ListFooterComponent={renderFooter}
                />
            ) : (
                <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Browse Generes</Text>
                    <FlatList
                        data={genres}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                style={[
                                    styles.genreItem,
                                    { backgroundColor: genreColors[index % genreColors.length] }
                                ]}
                                onPress={() => navigation.navigate('GenreDetail', { genre: item })}
                            >
                                <Text style={styles.genreText}>{item.name}</Text>
                            </TouchableOpacity>
                        )}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        columnWrapperStyle={styles.columnWrapper}
                        contentContainerStyle={styles.listContent}
                    />
                </View>
            )}
        </SafeAreaView>
    );
};

const MUSIC_GENRES = [
    { id: 'pop', name: 'Pop' },
    { id: 'hits', name: 'Hits' },
    { id: 'alternative', name: 'Alternative' },
    { id: 'hip-hop', name: 'Hip-Hop' },
    { id: 'rnb', name: 'R&B' },
    { id: 'country', name: 'Country' },
    { id: 'latin', name: 'Latin' },
    { id: 'dance', name: 'Dance' },
    { id: 'electronic', name: 'Electronic' },
    { id: 'k-pop', name: 'K-Pop' },
    { id: 'rock', name: 'Rock' },
    { id: 'classical', name: 'Classical' },
    { id: 'jazz', name: 'Jazz' },
    { id: 'blues', name: 'Blues' },
    { id: 'metal', name: 'Metal' },
    { id: 'punk', name: 'Punk' },
    { id: 'folk', name: 'Folk' },
    { id: 'soul-funk', name: 'Soul/Funk' },
    { id: 'reggaeton', name: 'Reggaeton' },
    { id: 'afrobeats', name: 'Afrobeats' },
    { id: 'reggae', name: 'Reggae' },
    { id: 'indie', name: 'Indie' },
    { id: 'oldies', name: 'Oldies' },
    { id: '90s', name: "'90s" },
    { id: '80s', name: "'80s" },
    { id: '70s', name: "'70s" },
    { id: '60s', name: "'60s" },
    { id: '2000s', name: '2000s' },
    { id: 'chill', name: 'Chill' },
    { id: 'focus', name: 'Focus' },
    { id: 'sleep', name: 'Sleep' },
    { id: 'romance', name: 'Romance' },
    { id: 'party', name: 'Party' },
    { id: 'feel-good', name: 'Feel Good' },
    { id: 'sad', name: 'Sad' },
    { id: 'motivation', name: 'Motivation' },
    { id: 'fitness', name: 'Fitness' },
    { id: 'sports', name: 'Sports' },
    { id: 'commute', name: 'Commute' },
    { id: 'kids', name: 'Kids' },
    { id: 'family', name: 'Family' },
    { id: 'sound-therapy', name: 'Sound Therapy' },
    { id: 'ambient', name: 'Ambient' },
    { id: 'instrumental', name: 'Instrumental' },
    { id: 'spatial-audio', name: 'Spatial Audio' },
    { id: 'apple-live', name: 'Apple Music Live' },
    { id: 'dj-mixes', name: 'DJ Mixes' },
    { id: 'music-videos', name: 'Music Videos' },
    { id: 'world', name: 'World' },
    { id: 'african', name: 'African' },
    { id: 'arabic', name: 'Arabic' },
    { id: 'indian', name: 'Indian' },
    { id: 'bollywood', name: 'Bollywood' },
    { id: 'j-pop', name: 'J-Pop' },
    { id: 'c-pop', name: 'C-Pop' },
    { id: 'musica-mexicana', name: 'Música Mexicana' },
    { id: 'urbano-latino', name: 'Urbano Latino' },
    { id: 'pop-latino', name: 'Pop Latino' },
    { id: 'christian', name: 'Christian' },
    { id: 'gospel', name: 'Gospel' },
    { id: 'americana', name: 'Americana' },
    { id: 'bluegrass', name: 'Bluegrass' },
    { id: 'acoustic', name: 'Acoustic' },
    { id: 'comedy', name: 'Comedy' },
    { id: 'spoken-word', name: 'Spoken Word' },
    { id: 'essentials', name: 'Essentials' },
    { id: 'behind-songs', name: 'Behind the Songs' },
    { id: 'film-tv-stage', name: 'Film, TV & Stage' },
    { id: 'charts', name: 'Charts' },
    { id: 'coming-soon', name: 'Coming Soon' },
    { id: 'apple-radio', name: 'Apple Music Radio' }
];

const genreColors = [
    '#FF2D55', '#FFC107', '#4CAF50', '#2196F3', '#9C27B0',
    '#E91E63', '#673AB7', '#3F51B5', '#00BCD4', '#009688',
    '#8BC34A', '#CDDC39', '#FF9800', '#FF5722', '#795548',
    '#607D8B', '#FA8072', '#20B2AA', '#87CEEB', '#DDA0DD',
    '#F08080', '#90EE90', '#FFB6C1', '#FFA07A', '#00FA9A'
];

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2', // Light Gray App Background
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 15,
        paddingTop: 10,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#000', // Black
    },
    searchBarContainer: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    attributionContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.5
    },
    attributionText: {
        color: '#666',
        fontSize: 12,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
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
    textInput: {
        flex: 1,
        fontSize: 16,
        color: '#000',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000',
        marginLeft: 20,
        marginBottom: 15,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 20
    },
    columnWrapper: {
        justifyContent: 'space-between',
    },
    genreItem: {
        width: (SCREEN_WIDTH - 50) / 2,
        height: 100,
        borderRadius: 12,
        marginBottom: 15,
        alignItems: 'flex-start', // text bottom left usually or center
        justifyContent: 'flex-end',
        padding: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3.84,
        elevation: 5,
    },
    genreText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'left',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginBottom: 10,
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    albumArt: {
        width: 50,
        height: 50,
        borderRadius: 5,
        marginRight: 15,
        backgroundColor: '#DDD'
    },
    resultInfo: {
        flex: 1
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 4
    },
    resultSubtitle: {
        fontSize: 14,
        color: '#666'
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emptyText: {
        color: '#666',
        fontSize: 16
    }
});

export default SearchScreenMusic;
