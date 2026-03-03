import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, Platform, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getArtistDetails, formatArtworkUrl } from '../api/MusicService';
import { SafeAreaView } from 'react-native-safe-area-context';

const ArtistDetailScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { artistId, artistName } = route.params || {};

    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bioExpanded, setBioExpanded] = useState(false);

    useEffect(() => {
        if (artistId) {
            fetchDetails();
        } else {
            setLoading(false);
        }
    }, [artistId]);

    const fetchDetails = async () => {
        setLoading(true);
        try {
            const data = await getArtistDetails(artistId);
            setDetails(data);
        } catch (error) {
            console.error("Error fetching artist details:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#ff8c00" />
            </View>
        );
    }

    if (!details && !artistName) return (
        <View style={[styles.container, styles.center]}>
            <Text style={{ color: '#fff' }}>Artist not found.</Text>
        </View>
    );

    // Fallback if details fail but we have a name passed via route
    const displayData = details || { attributes: { name: artistName } };
    const albums = details?.relationships?.albums?.data || [];

    // Sort albums by date desc
    const sortedAlbums = [...albums].sort((a, b) => {
        const dateA = new Date(a.attributes.releaseDate);
        const dateB = new Date(b.attributes.releaseDate);
        return dateB - dateA;
    });

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-left" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{displayData.attributes.name}</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Section */}
                <View style={styles.profileSection}>
                    <View style={styles.profileImageWrapper}>
                        <MaterialIcon name="microphone-variant" size={60} color="#555" />
                        {/* If we had an artist image URL, we would show it here. 
                            Apple Music API often embeds artist images in a separate relationship or search result.
                            For now, using a placeholder icon or logic if URL existed. 
                         */}
                    </View>
                    <View style={styles.profileInfo}>
                        <Text style={styles.name}>{displayData.attributes.name}</Text>
                        {displayData.attributes.genreNames && (
                            <Text style={styles.genre}>
                                {displayData.attributes.genreNames.join(', ')}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Biography */}
                {displayData.attributes.editorialNotes?.short ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>About</Text>
                        <Text style={styles.bioText} numberOfLines={bioExpanded ? undefined : 4}>
                            {displayData.attributes.editorialNotes.short}
                        </Text>
                        <TouchableOpacity onPress={() => setBioExpanded(!bioExpanded)}>
                            <Text style={styles.readMore}>{bioExpanded ? "Show Less" : "Show More"}</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Discography Table */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Discography</Text>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeadText, { flex: 0.2 }]}>Year</Text>
                        <Text style={[styles.tableHeadText, { flex: 0.6 }]}>Album</Text>
                        <Text style={[styles.tableHeadText, { flex: 0.2, textAlign: 'right' }]}>Tracks</Text>
                    </View>

                    {sortedAlbums.length > 0 ? (
                        sortedAlbums.map((item, index) => {
                            const year = (item.attributes.releaseDate || "").split('-')[0];
                            return (
                                <TouchableOpacity
                                    key={`${item.id}-${index}`}
                                    style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}
                                    onPress={() => navigation.push('AlbumDetails', { albumId: item.id })}
                                >
                                    <Text style={[styles.cellText, { flex: 0.2, color: '#888' }]}>{year}</Text>
                                    <View style={{ flex: 0.6, flexDirection: 'row', alignItems: 'center' }}>
                                        {item.attributes.artwork && (
                                            <Image
                                                source={{ uri: formatArtworkUrl(item.attributes.artwork.url, 50, 50) }}
                                                style={{ width: 30, height: 30, borderRadius: 4, marginRight: 10 }}
                                            />
                                        )}
                                        <Text style={[styles.cellText, { fontWeight: 'bold', color: '#fff', flex: 1 }]} numberOfLines={1}>
                                            {item.attributes.name}
                                        </Text>
                                    </View>
                                    <Text style={[styles.cellText, { flex: 0.2, textAlign: 'right', fontStyle: 'italic', color: '#666' }]}>
                                        {item.attributes.trackCount ? item.attributes.trackCount : '-'}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })
                    ) : (
                        <Text style={{ color: '#666', fontStyle: 'italic', marginTop: 10 }}>No albums found.</Text>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a'
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        backgroundColor: '#161625',
        borderBottomWidth: 1,
        borderBottomColor: '#333'
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        flex: 1,
        textAlign: 'center'
    },
    scrollContent: {
        padding: 20
    },
    profileSection: {
        flexDirection: 'row',
        marginBottom: 25,
        alignItems: 'center'
    },
    profileImageWrapper: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#252535',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#ff8c00'
    },
    profileInfo: {
        flex: 1,
        marginLeft: 20,
        justifyContent: 'center'
    },
    name: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
        fontFamily: 'Trebuchet MS'
    },
    genre: {
        fontSize: 16,
        color: '#ff8c00',
        marginBottom: 5
    },
    birthInfo: {
        fontSize: 14,
        color: '#888',
        fontStyle: 'italic'
    },
    section: {
        marginBottom: 25
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
        borderLeftWidth: 3,
        borderLeftColor: '#e50914',
        paddingLeft: 10
    },
    bioText: {
        color: '#ccc',
        fontSize: 15,
        lineHeight: 24,
    },
    readMore: {
        color: '#ff8c00',
        marginTop: 5,
        fontWeight: 'bold'
    },
    // Table Styles
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#222',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 5,
        marginBottom: 5
    },
    tableHeadText: {
        color: '#aaa',
        fontWeight: 'bold',
        fontSize: 12,
        textTransform: 'uppercase'
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#222'
    },
    rowEven: {
        backgroundColor: '#111'
    },
    rowOdd: {
        backgroundColor: '#0a0a1a'
    },
    cellText: {
        color: '#ccc',
        fontSize: 14
    }
});

export default ArtistDetailScreen;
