import React, { useContext, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Dimensions,
    SafeAreaView,
    StatusBar,
    Platform,
    Modal
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { MusicContext } from '../context/MusicContext';
import { formatArtworkUrl } from '../api/MusicService';

const { width } = Dimensions.get('window');

const YearInReviewScreen = () => {
    const navigation = useNavigation();
    const { overallRatedAlbums, ratingMethod } = useContext(MusicContext);
    const [selectedYear, setSelectedYear] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);

    // 1. Determine all unique years based on user's rating dates (ratedAt), falling back to releaseDate
    const activityYears = useMemo(() => {
        if (!overallRatedAlbums) return [];
        const years = new Set();
        overallRatedAlbums.forEach(album => {
            const dateStr = album.ratedAt || album.releaseDate;
            if (dateStr && typeof dateStr === 'string' && dateStr.length >= 4) {
                const year = dateStr.substring(0, 4);
                if (/^\d{4}$/.test(year)) {
                    years.add(year);
                }
            }
        });
        const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
        
        // Auto-select latest year if not yet selected
        if (sortedYears.length > 0 && !selectedYear) {
            setSelectedYear(sortedYears[0]);
        }
        return sortedYears;
    }, [overallRatedAlbums, selectedYear]);

    // 2. Filter rated albums for the chosen calendar year
    const albumsForYear = useMemo(() => {
        if (!selectedYear) return [];
        return overallRatedAlbums.filter(album => {
            const dateStr = album.ratedAt || album.releaseDate;
            return dateStr && dateStr.startsWith(selectedYear);
        });
    }, [overallRatedAlbums, selectedYear]);

    // 3. Compute stats
    const stats = useMemo(() => {
        const total = albumsForYear.length;
        if (total === 0) return { total: 0, average: 0, highest: [], topGenres: [], distribution: { excel: 0, good: 0, avg: 0, poor: 0 } };

        const sum = albumsForYear.reduce((acc, a) => acc + (a.userOverallRating || 0), 0);
        const average = sum / total;

        // Top rated sorted descending
        const highest = [...albumsForYear].sort((a, b) => (b.userOverallRating || 0) - (a.userOverallRating || 0)).slice(0, 5);

        // Top genres computation
        const genreCounts = {};
        albumsForYear.forEach(album => {
            const genres = album.genreNames || [];
            genres.forEach(g => {
                genreCounts[g] = (genreCounts[g] || 0) + 1;
            });
        });
        const topGenres = Object.entries(genreCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        // Score distributions based on active system
        let excel = 0, good = 0, avg = 0, poor = 0;
        albumsForYear.forEach(album => {
            const val = album.userOverallRating || 0;
            if (ratingMethod === 'Percentage') {
                if (val >= 90) excel++;
                else if (val >= 75) good++;
                else if (val >= 50) avg++;
                else poor++;
            } else if (ratingMethod === '1-5' || ratingMethod === 'Pizza' || ratingMethod === 'pizza') {
                if (val >= 4.5) excel++;
                else if (val >= 3.5) good++;
                else if (val >= 2.5) avg++;
                else poor++;
            } else {
                // Classic 1-10 or default
                if (val >= 9.0) excel++;
                else if (val >= 7.0) good++;
                else if (val >= 5.0) avg++;
                else poor++;
            }
        });

        return {
            total,
            average,
            highest,
            topGenres,
            distribution: { excel, good, avg, poor }
        };
    }, [albumsForYear, ratingMethod]);

    // Format rating numbers visually based on method
    const renderRating = (score) => {
        if (ratingMethod === 'Percentage') {
            return `${score.toFixed(0)}%`;
        }
        return score.toFixed(1);
    };

    // Render Badge/Stars/Pizza details
    const renderRatingBadgeValue = (val) => {
        if (ratingMethod === 'Percentage') {
            return `${val.toFixed(0)}%`;
        } else if (ratingMethod === '1-5' || ratingMethod === 'Pizza' || ratingMethod === 'pizza') {
            return `${val.toFixed(1)}`;
        }
        return `${val.toFixed(1)}/10`;
    };

    const getRatingMethodIcon = () => {
        if (ratingMethod === 'Percentage') return 'percent';
        if (ratingMethod === 'Pizza' || ratingMethod === 'pizza' || ratingMethod === '1-5') return 'pizza';
        if (ratingMethod === 'Awards' || ratingMethod === 'awards') return 'trophy';
        return 'star';
    };

    const getDistributionPercentage = (count) => {
        if (stats.total === 0) return '0%';
        return `${((count / stats.total) * 100).toFixed(0)}%`;
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Icon name="arrow-left" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Year in Review</Text>
                {stats.total > 0 ? (
                    <TouchableOpacity style={styles.shareButton} onPress={() => setShowShareModal(true)}>
                        <Icon name="share-alt" size={20} color="#d4a03e" />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            {/* Year Selector Pills */}
            <View style={styles.yearsContainer}>
                {activityYears.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearsScroll}>
                        {activityYears.map(year => (
                            <TouchableOpacity
                                key={year}
                                style={[styles.yearPill, selectedYear === year && styles.yearPillActive]}
                                onPress={() => setSelectedYear(year)}
                            >
                                <Text style={[styles.yearPillText, selectedYear === year && styles.yearPillTextActive]}>{year}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                ) : (
                    <Text style={styles.noYearsText}>No rating history found.</Text>
                )}
            </View>

            {/* Main Stats Panel */}
            {selectedYear && stats.total > 0 ? (
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    
                    {/* Hero stats Card */}
                    <View style={styles.heroCard}>
                        <View style={styles.heroStatsContainer}>
                            <View style={styles.heroStatItem}>
                                <Text style={styles.heroLabel}>ALBUMS RATED</Text>
                                <Text style={styles.heroValue}>{stats.total}</Text>
                            </View>
                            <View style={styles.heroDivider} />
                            <View style={styles.heroStatItem}>
                                <Text style={styles.heroLabel}>AVERAGE RATING</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.heroValue}>{renderRating(stats.average)}</Text>
                                    <Icon name={getRatingMethodIcon()} size={18} color="#d4a03e" style={{ marginLeft: 5, marginTop: 10 }} />
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Top Genres Section */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Your Taste Profile</Text>
                        {stats.topGenres.length > 0 ? (
                            <View style={styles.genresGrid}>
                                {stats.topGenres.map((genre, idx) => (
                                    <View key={genre.name} style={[styles.genreCard, idx === 0 && styles.genreCardPrimary]}>
                                        <Text style={[styles.genreIndex, idx === 0 && styles.genreIndexPrimary]}>#{idx + 1}</Text>
                                        <Text style={[styles.genreName, idx === 0 && styles.genreNamePrimary]}>{genre.name}</Text>
                                        <Text style={[styles.genreCount, idx === 0 && styles.genreCountPrimary]}>{genre.count} albums</Text>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <Text style={styles.emptyText}>No genre data available for these albums.</Text>
                        )}
                    </View>

                    {/* Rating distribution section */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Rating Distribution</Text>
                        <View style={styles.distContainer}>
                            {/* Excellent */}
                            <View style={styles.distRow}>
                                <Text style={styles.distLabel}>Excellent</Text>
                                <View style={styles.barBackground}>
                                    <View style={[styles.barFill, { width: getDistributionPercentage(stats.distribution.excel), backgroundColor: '#d4a03e' }]} />
                                </View>
                                <Text style={styles.distValue}>{stats.distribution.excel}</Text>
                            </View>

                            {/* Good */}
                            <View style={styles.distRow}>
                                <Text style={styles.distLabel}>Good</Text>
                                <View style={styles.barBackground}>
                                    <View style={[styles.barFill, { width: getDistributionPercentage(stats.distribution.good), backgroundColor: '#e5c585' }]} />
                                </View>
                                <Text style={styles.distValue}>{stats.distribution.good}</Text>
                            </View>

                            {/* Average */}
                            <View style={styles.distRow}>
                                <Text style={styles.distLabel}>Average</Text>
                                <View style={styles.barBackground}>
                                    <View style={[styles.barFill, { width: getDistributionPercentage(stats.distribution.avg), backgroundColor: '#888' }]} />
                                </View>
                                <Text style={styles.distValue}>{stats.distribution.avg}</Text>
                            </View>

                            {/* Poor */}
                            <View style={styles.distRow}>
                                <Text style={styles.distLabel}>Poor</Text>
                                <View style={styles.barBackground}>
                                    <View style={[styles.barFill, { width: getDistributionPercentage(stats.distribution.poor), backgroundColor: '#ff4444' }]} />
                                </View>
                                <Text style={styles.distValue}>{stats.distribution.poor}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Podium Section */}
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>My Top Albums of {selectedYear}</Text>
                        <View style={styles.podiumList}>
                            {stats.highest.map((album, index) => {
                                const artUrl = album.artwork?.url 
                                    ? formatArtworkUrl(album.artwork.url, 200, 200) 
                                    : 'https://via.placeholder.com/150';
                                
                                return (
                                    <TouchableOpacity
                                        key={album.id}
                                        style={styles.podiumItem}
                                        onPress={() => navigation.navigate('AlbumDetails', { albumId: album.id, album })}
                                    >
                                        <Image source={{ uri: artUrl }} style={styles.podiumArt} />
                                        <View style={styles.podiumDetails}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Text style={styles.podiumIndex}>#{index + 1}</Text>
                                                <Text style={styles.podiumAlbumName} numberOfLines={1}>{album.name}</Text>
                                            </View>
                                            <Text style={styles.podiumArtistName} numberOfLines={1}>{album.artistName}</Text>
                                        </View>
                                        <View style={styles.podiumScoreBadge}>
                                            <Icon name={getRatingMethodIcon()} size={10} color="#d4a03e" style={{ marginRight: 4 }} />
                                            <Text style={styles.podiumScoreText}>{renderRatingBadgeValue(album.userOverallRating)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <View style={{ height: 50 }} />
                </ScrollView>
            ) : (
                <View style={styles.emptyContainer}>
                    <Icon name="music" size={48} color="#444" style={{ marginBottom: 15 }} />
                    <Text style={styles.emptyStateTitle}>No Ratings in {selectedYear || 'this year'}</Text>
                    <Text style={styles.emptyStateSubtitle}>Rate albums during this year to populate stats!</Text>
                </View>
            )}

            {/* Share Collage Modal */}
            <Modal
                visible={showShareModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowShareModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        {/* Title Bar */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Share {selectedYear} Review</Text>
                            <TouchableOpacity onPress={() => setShowShareModal(false)}>
                                <Icon name="close" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {/* Screenshot Card Canvas */}
                        <View style={styles.shareCanvas}>
                            <Text style={styles.shareTitle}>TOMO MUSIC</Text>
                            <Text style={styles.shareSubtitle}>{selectedYear} YEAR IN REVIEW</Text>
                            
                            {/* Mini Stats Grid */}
                            <View style={styles.shareStatsGrid}>
                                <View style={styles.shareStatItem}>
                                    <Text style={styles.shareStatVal}>{stats.total}</Text>
                                    <Text style={styles.shareStatLbl}>Albums Rated</Text>
                                </View>
                                <View style={styles.shareStatDivider} />
                                <View style={styles.shareStatItem}>
                                    <Text style={styles.shareStatVal}>{renderRating(stats.average)}</Text>
                                    <Text style={styles.shareStatLbl}>Average Score</Text>
                                </View>
                            </View>

                            {/* Top 3 Collages Grid */}
                            <Text style={styles.shareSectionTitle}>TOP ALBUMS</Text>
                            <View style={styles.shareCollage}>
                                {stats.highest.slice(0, 3).map((album, idx) => {
                                    const artUrl = album.artwork?.url 
                                        ? formatArtworkUrl(album.artwork.url, 200, 200) 
                                        : 'https://via.placeholder.com/150';
                                    return (
                                        <View key={album.id} style={styles.shareCollageItem}>
                                            <Image source={{ uri: artUrl }} style={styles.shareCollageArt} />
                                            <Text style={styles.shareCollageRank}>#{idx + 1}</Text>
                                            <Text style={styles.shareCollageName} numberOfLines={1}>{album.name}</Text>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Bottom Note */}
                            <Text style={styles.shareFooter}>Generated via TOMO App</Text>
                        </View>

                        {/* Instructions */}
                        <Text style={styles.shareInstructions}>Take a screenshot of the card above to share with your friends!</Text>

                        {/* Back to EOY */}
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowShareModal(false)}>
                            <Text style={styles.modalCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a', // Sleek dark navy/black
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#161625',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        fontFamily: 'Trebuchet MS',
    },
    shareButton: {
        padding: 4,
    },
    yearsContainer: {
        paddingVertical: 12,
        backgroundColor: '#0d0d21',
    },
    yearsScroll: {
        paddingHorizontal: 16,
    },
    yearPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#161625',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#252538',
    },
    yearPillActive: {
        backgroundColor: '#d4a03e',
        borderColor: '#d4a03e',
    },
    yearPillText: {
        fontSize: 14,
        color: '#aaa',
        fontWeight: '600',
    },
    yearPillTextActive: {
        color: '#000',
        fontWeight: 'bold',
    },
    noYearsText: {
        textAlign: 'center',
        color: '#666',
        fontSize: 14,
        fontStyle: 'italic',
    },
    scrollContent: {
        padding: 16,
    },
    heroCard: {
        backgroundColor: '#1E1B2C',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#d4a03e',
        shadowColor: '#d4a03e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 6,
    },
    heroStatsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    heroStatItem: {
        alignItems: 'center',
    },
    heroDivider: {
        width: 1,
        height: 50,
        backgroundColor: 'rgba(212, 175, 55, 0.2)',
    },
    heroValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 5,
    },
    heroLabel: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#d4a03e',
        letterSpacing: 1,
    },
    sectionContainer: {
        backgroundColor: '#161625',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#252538',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
        letterSpacing: 0.5,
    },
    genresGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    genreCard: {
        width: '31%',
        backgroundColor: '#1E1E2F',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2D2D3F',
    },
    genreCardPrimary: {
        backgroundColor: '#2A2033',
        borderColor: '#d4a03e',
    },
    genreIndex: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#888',
        marginBottom: 5,
    },
    genreIndexPrimary: {
        color: '#d4a03e',
    },
    genreName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 5,
    },
    genreNamePrimary: {
        fontSize: 16,
        color: '#fff',
    },
    genreCount: {
        fontSize: 11,
        color: '#666',
    },
    genreCountPrimary: {
        color: '#aaa',
    },
    distContainer: {
        paddingVertical: 4,
    },
    distRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    distLabel: {
        width: 75,
        fontSize: 13,
        color: '#aaa',
        fontWeight: '600',
    },
    barBackground: {
        flex: 1,
        height: 10,
        backgroundColor: '#10101C',
        borderRadius: 5,
        marginHorizontal: 12,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 5,
    },
    distValue: {
        width: 25,
        fontSize: 13,
        color: '#fff',
        fontWeight: 'bold',
        textAlign: 'right',
    },
    podiumList: {
        paddingVertical: 4,
    },
    podiumItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E2F',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#2a2a3a',
    },
    podiumArt: {
        width: 50,
        height: 50,
        borderRadius: 5,
        marginRight: 12,
    },
    podiumDetails: {
        flex: 1,
        justifyContent: 'center',
    },
    podiumIndex: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#d4a03e',
        marginRight: 6,
    },
    podiumAlbumName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff',
        width: '80%',
    },
    podiumArtistName: {
        fontSize: 12,
        color: '#aaa',
        marginTop: 2,
    },
    podiumScoreBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10101C',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#d4a03e',
    },
    podiumScoreText: {
        color: '#d4a03e',
        fontSize: 11,
        fontWeight: 'bold',
    },
    emptyText: {
        color: '#666',
        fontSize: 14,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    emptyStateSubtitle: {
        fontSize: 14,
        color: '#aaa',
        textAlign: 'center',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalCard: {
        backgroundColor: '#12121E',
        borderRadius: 20,
        width: '100%',
        maxHeight: '90%',
        padding: 20,
        borderWidth: 1,
        borderColor: '#d4a03e',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    shareCanvas: {
        backgroundColor: '#1E1B2C',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#d4a03e',
        marginBottom: 16,
    },
    shareTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#d4a03e',
        letterSpacing: 2,
    },
    shareSubtitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#fff',
        marginVertical: 4,
        letterSpacing: 1,
        fontFamily: Platform.OS === 'ios' ? 'Trebuchet MS' : 'sans-serif-condensed',
    },
    shareStatsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginVertical: 15,
        backgroundColor: '#161625',
        paddingVertical: 12,
        borderRadius: 12,
    },
    shareStatDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(212, 175, 55, 0.2)',
        alignSelf: 'center',
    },
    shareStatVal: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
    },
    shareStatLbl: {
        fontSize: 10,
        color: '#aaa',
        textAlign: 'center',
        marginTop: 2,
    },
    shareSectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#d4a03e',
        letterSpacing: 1.5,
        marginBottom: 10,
    },
    shareCollage: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 10,
    },
    shareCollageItem: {
        width: '31%',
        alignItems: 'center',
    },
    shareCollageArt: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(212,175,55,0.4)',
    },
    shareCollageRank: {
        fontSize: 14,
        fontWeight: '900',
        color: '#d4a03e',
        marginTop: 4,
    },
    shareCollageName: {
        fontSize: 10,
        color: '#fff',
        textAlign: 'center',
        marginTop: 2,
    },
    shareFooter: {
        fontSize: 10,
        color: '#666',
        marginTop: 15,
        letterSpacing: 1,
    },
    shareInstructions: {
        color: '#aaa',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    modalCloseButton: {
        backgroundColor: '#161625',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#252538',
    },
    modalCloseButtonText: {
        color: '#ff4444',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default YearInReviewScreen;
