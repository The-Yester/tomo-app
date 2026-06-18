import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/FontAwesome';
import { getNewReleases, formatArtworkUrl } from '../api/MusicService';

const TrendingScreen = ({ navigation }) => {
    const [trendingAlbums, setTrendingAlbums] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                const data = await getNewReleases();
                setTrendingAlbums(data);
            } catch (error) {
                console.error("Failed to fetch trending albums:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTrending();
    }, []);

    const renderAlbumItem = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('AlbumDetails', { albumId: item.id, album: item })}
        >
            <Image
                source={{ uri: formatArtworkUrl(item.attributes.artwork?.url, 300, 300) }}
                style={styles.artwork}
            />
            <View style={styles.infoContainer}>
                <Text style={styles.dateTag}>
                    {new Date(item.attributes.releaseDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={styles.albumTitle} numberOfLines={1}>{item.attributes.name}</Text>
                <Text style={styles.artistName} numberOfLines={1}>{item.attributes.artistName}</Text>

                <TouchableOpacity style={styles.notifyButton}>
                    <Icon name="bell-o" size={12} color="#000" />
                    <Text style={styles.notifyText}>Notify</Text>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#e9af45" />
            </View>
        );
    }

    const renderFooter = () => (
        <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
                This product uses data provided by Apple Music & Custom Solutions, but is not endorsed or certified. TOMO Music is a music discovery and rating app. This app does not stream music and is not affiliated with or endorsed by any music corporation or streaming services.
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Trending</Text>
                </View>
                <FlatList
                    data={trendingAlbums}
                    renderItem={renderAlbumItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    numColumns={2}
                    key="grid" // Forces fresh render for grid layout
                    columnWrapperStyle={styles.columnWrapper}
                    ListFooterComponent={renderFooter}
                />
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F2',
    },
    safeArea: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F2F2F2',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#F2F2F2',
        // Removed border for cleaner look
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#000',
        fontFamily: 'Trebuchet MS',
    },
    listContent: {
        padding: 10,
    },
    columnWrapper: {
        justifyContent: 'space-between',
    },
    card: {
        flex: 1,
        backgroundColor: '#d4a03e',
        borderRadius: 12,
        marginBottom: 15,
        marginHorizontal: 5,
        overflow: 'hidden',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        borderWidth: 1,
        borderColor: '#C6A87C',
        maxWidth: '48%', // Ensure 2 columns
    },
    artwork: {
        width: '100%',
        aspectRatio: 1,
        resizeMode: 'cover',
    },
    infoContainer: {
        padding: 10,
    },
    dateTag: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
        textTransform: 'uppercase',
        backgroundColor: 'rgba(255,255,255,0.4)',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    albumTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 2,
    },
    artistName: {
        fontSize: 12,
        color: '#222',
        marginBottom: 8,
    },
    notifyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.3)',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 12,
        marginTop: 5,
        alignSelf: 'flex-start'
    },
    notifyText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#000',
        marginLeft: 4,
    },
    disclaimerContainer: {
        paddingVertical: 30,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    disclaimerText: {
        fontSize: 10,
        color: '#999',
        textAlign: 'center',
        lineHeight: 14,
    }
});

export default TrendingScreen;
