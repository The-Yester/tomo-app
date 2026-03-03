import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    SafeAreaView,
    Platform,
    StatusBar
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { searchMusic, formatArtworkUrl } from '../api/MusicService';
import Icon from 'react-native-vector-icons/FontAwesome';

const GenreDetailScreen = ({ route }) => {
    const { genre } = route.params;
    const navigation = useNavigation();
    const [albums, setAlbums] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchGenreData = async () => {
            setLoading(true);
            try {
                // Apple Music API doesn't have a simple "get artists by genre" without a catalog chart iteration.
                // The easiest robust approach with the current search endpoint is to search the genre name itself.
                // This typically returns popular albums/artists tagged with or named after that genre.
                const results = await searchMusic(genre.name);
                setAlbums(results);
            } catch (error) {
                console.error("Error fetching genre data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchGenreData();
    }, [genre]);

    const renderAlbumItem = ({ item }) => {
        const imageUrl = item.attributes?.artwork?.url
            ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
            : 'https://via.placeholder.com/150';

        return (
            <TouchableOpacity
                style={styles.albumItem}
                onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
            >
                <Image source={{ uri: imageUrl }} style={styles.albumArt} />
                <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes?.name}</Text>
                <Text style={styles.artistName} numberOfLines={1}>{item.attributes?.artistName}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="chevron-left" size={20} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{genre.name}</Text>
                <View style={{ width: 20 }} />
            </View>

            {loading ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#d4a03e" />
                </View>
            ) : (
                <FlatList
                    data={albums}
                    renderItem={renderAlbumItem}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={
                        <View style={styles.centerContent}>
                            <Text style={styles.emptyText}>No top results found for {genre.name}.</Text>
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        padding: 15,
        paddingBottom: 30,
    },
    row: {
        justifyContent: 'space-between',
    },
    albumItem: {
        width: '48%',
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 10,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        alignItems: 'center',
    },
    albumArt: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 8,
        marginBottom: 10,
        backgroundColor: '#DDD',
    },
    albumTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
        textAlign: 'center',
        marginBottom: 2,
    },
    artistName: {
        fontSize: 12,
        color: '#888',
        textAlign: 'center',
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
    }
});

export default GenreDetailScreen;
