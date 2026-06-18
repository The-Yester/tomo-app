import React, { useContext, useMemo, useLayoutEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, Alert, Modal, SafeAreaView, Platform, StatusBar, Share, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/FontAwesome';
import { MusicContext } from '../context/MusicContext';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { formatArtworkUrl, addCuration } from '../api/MusicService';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
const OVERALL_RATINGS_LIST_NAME = "Overall Ratings";
// Window Dimensions Calculation
const { width } = Dimensions.get('window');
// Padding on content container is 16 on each side (32 total), gap is 10 x 2 (20 total)
const TILE_SIZE = (width - 32 - 20) / 3;

const ListDetailScreen = ({ route }) => {
  const { listId, listName } = route.params;
  const { getAlbumsInList, removeAlbumFromList, overallRatedAlbums, ratingMethod } = useContext(MusicContext);
  const navigation = useNavigation();
  const [sortBy, setSortBy] = useState('Highest Rated');
  const [isSortModalVisible, setSortModalVisible] = useState(false);
  const [viewType, setViewType] = useState('deck'); // 'deck' or 'gallery'
  const [isPublishing, setIsPublishing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const displayRating = (val) => {
    if (val === undefined || val === null) return 'N/A';
    const parsed = parseFloat(val);
    if (ratingMethod === 'Percentage') {
      return parsed % 1 === 0 ? `${parsed}%` : `${parsed.toFixed(1)}%`;
    }
    return parsed.toFixed(1);
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Check for tooltip tutorial
  React.useEffect(() => {
    const checkTooltip = async () => {
      try {
        const hasSeen = await AsyncStorage.getItem('hasSeenCornerTooltip');
        if (!hasSeen) {
          // Add a small delay so UI renders first
          setTimeout(() => setShowTooltip(true), 500);
        }
      } catch (e) {
        console.error("Failed to load tooltip status", e);
      }
    };
    checkTooltip();
  }, []);

  const dismissTooltip = async () => {
    setShowTooltip(false);
    try {
      await AsyncStorage.setItem('hasSeenCornerTooltip', 'true');
    } catch (e) {
      console.error("Failed to save tooltip status", e);
    }
  };

  const albumsInList = useMemo(() => {
    const albums = getAlbumsInList(listId) || [];
    return albums.map(album => {
      const ratedVersion = overallRatedAlbums.find(ra => ra.id === album.id);
      return {
        ...album,
        userOverallRating: ratedVersion ? ratedVersion.userOverallRating : album.userOverallRating,
        releaseDate: ratedVersion ? (ratedVersion.releaseDate || album.releaseDate) : album.releaseDate
      };
    });
  }, [listId, getAlbumsInList, overallRatedAlbums]);

  const isOverallRatingsList = listName === OVERALL_RATINGS_LIST_NAME || (typeof listId === 'string' && listId.startsWith('YEAR_'));

  const sortedAlbums = useMemo(() => {
    if (!albumsInList) return [];
    let sorted = [...albumsInList];

    switch (sortBy) {
      case 'Highest Rated':
        sorted.sort((a, b) => (b.userOverallRating || 0) - (a.userOverallRating || 0));
        break;
      case 'Lowest Rated':
        sorted.sort((a, b) => (a.userOverallRating || 0) - (b.userOverallRating || 0));
        break;
      case 'Alphabetical (A-Z)':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'Alphabetical (Z-A)':
        sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'Release Date (Newest)':
        sorted.sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
        break;
      case 'Release Date (Oldest)':
        sorted.sort((a, b) => new Date(a.releaseDate || 0) - new Date(b.releaseDate || 0));
        break;
    }
    return sorted;
  }, [albumsInList, sortBy]);

  const handleItemPress = (item) => {
    navigation.navigate('AlbumDetails', { albumId: item.id, album: item });
  };

  const publishList = async () => {
    setIsPublishing(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "You must be signed in to post.");
        return;
      }

      let userProfile = { name: "User", username: "user", profilePhoto: null };
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        userProfile = userDoc.data();
      }

      const newCuration = {
        title: listName,
        description: `Check out my list: ${listName}`,
        albums: albumsInList,
        userId: user.uid,
        username: userProfile.username || "user",
        userPhoto: userProfile.profilePhoto || null,
        timestamp: serverTimestamp(),
        likes: 0,
        likedBy: []
      };

      await addCuration(newCuration);
      Alert.alert("Success", "List posted to The Corner!");
    } catch (error) {
      console.error("Error publishing:", error);
      Alert.alert("Error", "Could not publish list.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePostToCorner = () => {
    if (albumsInList.length === 0) {
      Alert.alert("Empty List", "Add some albums before posting to The Corner!");
      return;
    }

    Alert.alert(
      "Post to The Corner",
      `Publish "${listName}" for others to see?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Post", onPress: publishList }
      ]
    );
  };

  const renderRightActions = (item) => {
    if (isOverallRatingsList) return null;

    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          Alert.alert(
            "Remove Album",
            `Remove "${item.name}"?`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", onPress: () => removeAlbumFromList(listId, item.id), style: 'destructive' }
            ]
          );
        }}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  const handleShare = async (item) => {
    Alert.alert(
      "Share Album",
      `Share "${item.name}"?`,
      [
        { text: "Cancel", style: "cancel" },

        {
          text: "Share Externally",
          onPress: async () => {
            try {
              const url = item.attributes?.url || '';
              await Share.share({
                message: `Check out "${item.name}" by ${item.artistName} on Topo! ${url}`,
                url: url
              });
            } catch (error) {
              console.error(error);
            }
          }
        }
      ]
    );
  };

  const renderDeckItem = ({ item, index }) => {
    const artworkUrl = item.attributes?.artwork?.url
      ? formatArtworkUrl(item.attributes.artwork.url, 200, 200)
      : item.artwork?.url ? formatArtworkUrl(item.artwork.url, 200, 200)
        : 'https://via.placeholder.com/150';

    const rank = index + 1;
    const yourRating = item.userOverallRating;

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity
          style={styles.itemContainer}
          onPress={() => handleItemPress(item)}
        >
          <Image source={{ uri: artworkUrl }} style={styles.posterImage} />
          <View style={styles.rankContainer}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemSubtitle} numberOfLines={1}>{item.artistName}</Text>
          </View>

          <View style={styles.ratingsBoxesContainer}>
            <View style={[styles.ratingBox, styles.yourRatingBox]}>
              <Text style={styles.ratingBoxLabel}>Rating</Text>
              <Text style={styles.ratingBoxValue}>
                {displayRating(yourRating)}
              </Text>
            </View>

            <TouchableOpacity style={styles.shareButton} onPress={() => handleShare(item)}>
              <Icon name="share-square-o" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderGalleryItem = ({ item, index }) => {
    const artworkUrl = item.attributes?.artwork?.url
      ? formatArtworkUrl(item.attributes.artwork.url, 300, 300)
      : item.artwork?.url ? formatArtworkUrl(item.artwork.url, 300, 300)
        : 'https://via.placeholder.com/150';

    const rank = index + 1;
    const yourRating = item.userOverallRating;

    return (
      <View style={styles.galleryItemContainer}>
        <TouchableOpacity
          style={styles.galleryItem}
          onPress={() => handleItemPress(item)}
          onLongPress={() => {
            if (!isOverallRatingsList) {
              Alert.alert(
                "Remove Album",
                `Remove "${item.name}"?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", onPress: () => removeAlbumFromList(listId, item.id), style: 'destructive' }
                ]
              );
            }
          }}
        >
          <Image source={{ uri: artworkUrl }} style={styles.galleryImage} />
        </TouchableOpacity>
        <View style={styles.galleryItemInfoRow}>
          <Text style={styles.galleryItemRank}>{rank}.</Text>
          <Text style={styles.galleryItemRating}>
            {displayRating(yourRating)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#000" />
        </TouchableOpacity>

        <Text style={styles.listNameTitle} numberOfLines={1} ellipsizeMode='tail'>{listName}</Text>

        <View style={styles.headerRightButtons}>
          {/* Post to Corner Button */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handlePostToCorner}
            disabled={isPublishing}
          >
            <Icon name="diamond" size={22} color={isPublishing ? "#ccc" : "#d4a03e"} />
          </TouchableOpacity>

          {/* Toggle View Button */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setViewType(viewType === 'deck' ? 'gallery' : 'deck')}
          >
            <Icon name={viewType === 'deck' ? "th-large" : "list"} size={22} color="#000" />
          </TouchableOpacity>

          {/* Sort Button */}
          <TouchableOpacity style={styles.iconButton} onPress={() => setSortModalVisible(true)}>
            <Icon name="sort" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Conditional Tooltip overlay */}
      {showTooltip && (
        <TouchableOpacity style={styles.tooltipOverlay} activeOpacity={1} onPress={dismissTooltip}>
          <View style={styles.tooltipBubble}>
            <View style={styles.tooltipArrow} />
            <Text style={styles.tooltipTitle}>New Feature!</Text>
            <Text style={styles.tooltipText}>Tap the diamond icon to publish this collection to The Corner for others to discover.</Text>
            <TouchableOpacity style={styles.tooltipButton} onPress={dismissTooltip}>
              <Text style={styles.tooltipButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.subHeader}>
        <Text style={styles.sortLabel}>Sorted by: {sortBy}</Text>
      </View>

      {sortedAlbums.length > 0 ? (
        <FlatList
          key={viewType} // Force re-render when switching view types
          data={sortedAlbums}
          keyExtractor={(item) => item.id.toString()}
          renderItem={viewType === 'deck' ? renderDeckItem : renderGalleryItem}
          numColumns={viewType === 'deck' ? 1 : 3}
          contentContainerStyle={viewType === 'deck' ? styles.listContentContainer : styles.galleryContentContainer}
          columnWrapperStyle={viewType === 'gallery' ? styles.columnWrapper : null}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {isOverallRatingsList ? "You haven't rated any albums yet." : "No albums in this list yet."}
          </Text>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isSortModalVisible}
        onRequestClose={() => setSortModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sort By</Text>
            {[
              'Highest Rated',
              'Lowest Rated',
              'Alphabetical (A-Z)',
              'Alphabetical (Z-A)',
              'Release Date (Newest)',
              'Release Date (Oldest)'
            ].map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.modalOption, sortBy === option && styles.selectedOption]}
                onPress={() => {
                  setSortBy(option);
                  setSortModalVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, sortBy === option && styles.selectedOptionText]}>{option}</Text>
                {sortBy === option && <Icon name="check" size={16} color="#d4a03e" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeButton} onPress={() => setSortModalVisible(false)}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F2', // Light Gray
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  listContentContainer: {
    paddingHorizontal: 0,
  },
  galleryContentContainer: {
    padding: 16,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  itemContainer: {
    flexDirection: 'row',
    backgroundColor: '#d4a03e', // Gold Card
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 1,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#C6A87C'
  },
  galleryItemContainer: {
    width: TILE_SIZE,
    marginBottom: 16,
  },
  galleryItem: {
    flex: 1,
    height: TILE_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ccc',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  galleryItemInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 4,
  },
  galleryItemRank: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d4a03e',
  },
  galleryItemRating: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d4a03e',
  },
  posterImage: {
    width: 60,
    height: 60,
    borderRadius: 3,
    marginRight: 10,
  },
  rankContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    width: 25,
  },
  rankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  itemTextContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 5,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2
  },
  itemSubtitle: {
    fontSize: 14,
    color: '#222'
  },
  ratingsBoxesContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  ratingBox: {
    width: 60,
    height: 50,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  yourRatingBox: {
    backgroundColor: 'rgba(255,255,255,0.3)', // Subtle container
    borderWidth: 0,
  },
  ratingBoxLabel: {
    fontSize: 8,
    color: '#000',
    marginBottom: 2,
    textAlign: 'center',
    fontWeight: 'bold'
  },
  ratingBoxValue: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
  },
  shareButton: {
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginLeft: 5
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F2F2F2',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 15 : 0, // Extra padding for Android header inside SafeArea
    paddingBottom: 15,
    paddingHorizontal: 15,
    backgroundColor: '#F2F2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    minHeight: 60,
    zIndex: 100, // Ensure header zIndex
  },
  backButton: {
    padding: 10,
    zIndex: 10,
  },
  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  iconButton: {
    padding: 10,
    marginLeft: 5
  },
  sortButton: {
    padding: 10,
  },
  listNameTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    fontFamily: 'Trebuchet MS',
    zIndex: 1,
    paddingLeft: 50,
    paddingRight: 110, // Extra padding for the 3 right icons
    alignSelf: 'center', // Help centering just in case
  },
  subHeader: {
    backgroundColor: '#F2F2F2',
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  sortLabel: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic'
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 20,
    textAlign: 'center'
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  selectedOption: {
    backgroundColor: '#F2F2F2',
    backgroundColor: '#fff7e6', // light gold tint
    borderLeftWidth: 4,
    borderLeftColor: '#d4a03e',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#000',
  },
  selectedOptionText: {
    fontWeight: 'bold',
    color: '#d4a03e',
  },
  closeButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  tooltipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
  },
  tooltipBubble: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 90 : 70,
    right: 50, // Point roughly at the diamond icon
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -10,
    right: 25,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d4a03e',
    marginBottom: 8,
  },
  tooltipText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  tooltipButton: {
    backgroundColor: '#d4a03e',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tooltipButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  }
});

export default ListDetailScreen;