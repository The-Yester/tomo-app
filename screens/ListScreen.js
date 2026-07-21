import React, { useContext, useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, KeyboardAvoidingView, Modal } from 'react-native';
import { MusicContext, OVERALL_RATINGS_LIST_ID, OVERALL_RATINGS_LIST_NAME } from '../context/MusicContext';
import { v4 as uuidv4 } from 'uuid';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/FontAwesome';

// Locked lists that exist in user's musicLists
const USER_LOCKED_LISTS = ["Favorites", "Listen Later"];

const ListScreen = ({ navigation }) => {
    const { musicLists, addList, deleteList, overallRatedAlbums } = useContext(MusicContext);
    const [newListName, setNewListName] = useState('');
    const [sortBy, setSortBy] = useState('A-Z'); // 'A-Z' or 'Z-A'
    const [isSortModalVisible, setSortModalVisible] = useState(false);

    useEffect(() => {
        // Ensure user locked lists exist (Favorites, Listen Later)
        USER_LOCKED_LISTS.forEach(listName => {
            const exists = musicLists.some(list => list.name === listName);
            if (!exists) {
                const newList = {
                    id: uuidv4(),
                    name: listName,
                    albums: [],
                };
                addList(newList);
            }
        });
    }, [musicLists, addList]);

    const handleAddList = () => {
        const trimmedName = newListName.trim();
        // Check both user locked lists and the special Overall Ratings name
        if (trimmedName && !USER_LOCKED_LISTS.includes(trimmedName) && trimmedName !== OVERALL_RATINGS_LIST_NAME) {
            const newList = {
                id: uuidv4(),
                name: trimmedName,
                albums: [],
            };
            addList(newList);
            setNewListName('');
        }
    };

    const navigateToListDetails = (item) => {
        navigation.navigate('ListDetails', {
            listId: item.id,
            listName: item.name,
        });
    };

    const rightSwipeActions = (item) => {
        // Prevent deletion of Favorites, Listen Later, and Overall Ratings
        if (!USER_LOCKED_LISTS.includes(item.name) && item.name !== OVERALL_RATINGS_LIST_NAME) {
            return (
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteList(item.id)}>
                    <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
            );
        }
        return null;
    };

    // Construct the full list to display with Sorting
    const allLists = useMemo(() => {
        // 1. Pinned Lists
        const pinned = [
            {
                id: OVERALL_RATINGS_LIST_ID,
                name: OVERALL_RATINGS_LIST_NAME,
                albums: overallRatedAlbums || []
            },
            ...musicLists.filter(list => USER_LOCKED_LISTS.includes(list.name))
        ];

        // 2. Custom Lists (everything else)
        let custom = musicLists.filter(
            list => !USER_LOCKED_LISTS.includes(list.name) && list.name !== OVERALL_RATINGS_LIST_NAME
        );

        // Sort Custom Lists
        custom.sort((a, b) => {
            if (sortBy === 'A-Z') {
                return a.name.localeCompare(b.name);
            } else if (sortBy === 'Z-A') {
                return b.name.localeCompare(a.name);
            } else if (sortBy === '0-100') {
                // Try to extract first number
                const numA = parseInt(a.name.match(/\d+/) || 0, 10);
                const numB = parseInt(b.name.match(/\d+/) || 0, 10);
                if (numA !== numB) return numA - numB;
                return a.name.localeCompare(b.name, undefined, { numeric: true });
            } else if (sortBy === '100-0') {
                const numA = parseInt(a.name.match(/\d+/) || 0, 10);
                const numB = parseInt(b.name.match(/\d+/) || 0, 10);
                if (numA !== numB) return numB - numA;
                return b.name.localeCompare(a.name, undefined, { numeric: true });
            }
            return 0;
        });

        return [...pinned, ...custom];
    }, [musicLists, overallRatedAlbums, sortBy]);

    const releaseYears = useMemo(() => {
        if (!overallRatedAlbums) return [];
        const years = new Set();
        overallRatedAlbums.forEach(album => {
            if (album.releaseDate && typeof album.releaseDate === 'string' && album.releaseDate.length >= 4) {
                const year = album.releaseDate.substring(0, 4);
                if (/^\d{4}$/.test(year)) {
                    years.add(year);
                }
            }
        });
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [overallRatedAlbums]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Your Music Lists</Text>
                <TouchableOpacity style={styles.sortButton} onPress={() => setSortModalVisible(true)}>
                    <Icon name="sort" size={24} color="#000" />
                </TouchableOpacity>
            </View>

            {/* Browse by Release Year Banner */}
            {releaseYears.length > 0 && (
                <View style={styles.yearBannerContainer}>
                    <View style={styles.yearBannerHeader}>
                        <Icon name="calendar" size={14} color="#d4a03e" style={{ marginRight: 6 }} />
                        <Text style={styles.yearBannerTitle}>Browse by Release Year</Text>
                    </View>
                    <FlatList
                        horizontal
                        data={releaseYears}
                        keyExtractor={(item) => item}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.yearPillsContainer}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.yearPill}
                                onPress={() => navigateToListDetails({ id: `YEAR_${item}`, name: `Albums of ${item}` })}
                            >
                                <Text style={styles.yearPillText}>{item}</Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            <View style={styles.subHeader}>
                <Text style={styles.sortLabel}>Custom Lists: {sortBy}</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
            >
                <FlatList
                    data={allLists}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <Swipeable renderRightActions={() => rightSwipeActions(item)}>
                            <TouchableOpacity
                                style={styles.listItem}
                                onPress={() => navigateToListDetails(item)}
                            >
                                <Text style={styles.listName}>{item.name}</Text>
                                <Text style={styles.listCount}>{item.albums ? item.albums.length : 0} albums</Text>
                            </TouchableOpacity>
                        </Swipeable>
                    )}
                    ListEmptyComponent={<Text style={styles.empty}>No lists yet. Add one!</Text>}
                />
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="New List Name..."
                        placeholderTextColor="#666"
                        value={newListName}
                        onChangeText={setNewListName}
                    />
                    <Button title="Add List" onPress={handleAddList} color="#d4a03e" />
                </View>
            </KeyboardAvoidingView>

            <Modal
                animationType="slide"
                transparent={true}
                visible={isSortModalVisible}
                onRequestClose={() => setSortModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Sort Custom Lists</Text>
                        {['A-Z', 'Z-A', '0-100', '100-0'].map((option) => (
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
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#F2F2F2', // Light Gray
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 16
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    title: { fontSize: 24, fontWeight: 'bold', color: '#000', fontFamily: 'Trebuchet MS' },
    sortButton: { padding: 5 },
    subHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 10
    },
    sortLabel: {
        color: '#666',
        fontSize: 12,
        fontStyle: 'italic'
    },
    listItem: {
        padding: 15,
        backgroundColor: '#d4a03e', // Gold Card
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C6A87C',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    listName: { fontSize: 18, fontWeight: 'bold', color: '#000' },
    listCount: { color: '#333', marginTop: 4 },
    inputContainer: { marginTop: 20 },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        padding: 12,
        marginBottom: 10,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        color: '#000'
    },
    empty: { textAlign: 'center', marginTop: 20, fontStyle: 'italic', color: '#666' },
    deleteButton: {
        backgroundColor: '#d32f2f',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '88%',
        marginTop: 0,
        marginBottom: 10,
        borderRadius: 12,
        marginLeft: 10
    },
    deleteButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    // Modal Styles
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
        borderRadius: 8,
        paddingHorizontal: 10
    },
    modalOptionText: {
        fontSize: 16,
        color: '#333'
    },
    selectedOptionText: {
        color: '#d4a03e',
        fontWeight: 'bold'
    },
    closeButton: {
        marginTop: 20,
        alignItems: 'center',
        padding: 15
    },
    closeButtonText: {
        color: '#ff4444',
        fontSize: 16
    },
    yearBannerContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    yearBannerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    yearBannerTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000',
        fontFamily: 'Trebuchet MS',
    },
    yearPillsContainer: {
        paddingVertical: 4,
    },
    yearPill: {
        backgroundColor: '#F2F2F2',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#C6A87C',
    },
    yearPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#000',
    }
});

export default ListScreen;

