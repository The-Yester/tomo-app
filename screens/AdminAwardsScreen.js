import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Image, FlatList, ActivityIndicator, Alert, StatusBar, Platform, ActionSheetIOS, Modal } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import { fetchActiveAwardsEvents, addNomineeToCategory, removeNomineeFromCategory, addCategoryToEvent, removeCategoryFromEvent, markCategoryWinner, updateEvent, deleteEvent, updateNominee, reorderCategories, createNewEvent, reorderEvents } from '../api/AwardsService';
import { searchMovies } from '../api/MovieService';

// Standard Categories to pick from
const STANDARD_CATEGORIES = [
    { name: "Best Picture", key: "Picture" },
    { name: "Best Actor", key: "Leading Actor" },
    { name: "Best Actress", key: "Leading Actress" },
    { name: "Best Supporting Actor", key: "Supporting Actor" },
    { name: "Best Supporting Actress", key: "Supporting Actress" },
    { name: "Best Young Actor / Actress", key: "Young Actor" },
    { name: "Best Director", key: "Directing" },
    { name: "Best Original Screenplay", key: "Original Screenplay" },
    { name: "Best Adapted Screenplay", key: "Adapted Screenplay" },
    { name: "Best Casting and Ensemble", key: "Casting" },
    { name: "Best Cinematography", key: "Cinematography" },
    { name: "Best Production Design", key: "Production Design" },
    { name: "Best Editing", key: "Film Editing" },
    { name: "Best Costume Design", key: "Costume Design" },
    { name: "Best Hair and Makeup", key: "Makeup & Hairstyle" },
    { name: "Best Visual Effects", key: "Visual Effects" },
    { name: "Best Stunt Design", key: "Stunts" },
    { name: "Best Animated Feature", key: "Animated Feature" },
    { name: "Best Comedy", key: "Comedy" },
    { name: "Best Foreign Language Film", key: "Foreign Film" },
    { name: "Best Song", key: "Song" },
    { name: "Best Score", key: "Score" },
    { name: "Best Sound", key: "Sound" },
];

const AdminAwardsScreen = () => {
    const navigation = useNavigation();

    // State
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editLockOverride, setEditLockOverride] = useState(null); // 'auto', 'open', 'closed', or null

    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(false);

    // Create Event State
    const [createEventVisible, setCreateEventVisible] = useState(false);
    const [newEventName, setNewEventName] = useState('');
    const [newEventDate, setNewEventDate] = useState('');



    // Reorder Events State
    const [reorderEventsVisible, setReorderEventsVisible] = useState(false);
    const [tempEvents, setTempEvents] = useState([]);

    useEffect(() => {
        loadEvents();
    }, []);

    // Sync settings state when event selected
    useEffect(() => {
        if (selectedEvent) {
            // Convert timestamp to YYYY-MM-DD
            if (selectedEvent.date && selectedEvent.date.seconds) {
                const d = new Date(selectedEvent.date.seconds * 1000);
                setEditDate(d.toISOString().split('T')[0]);
            }
            setEditLockOverride(selectedEvent.lockOverride || 'auto');
        }
    }, [selectedEvent]);

    const saveDate = async () => {
        if (!selectedEvent || !editDate) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
            Alert.alert("Invalid Format", "Use YYYY-MM-DD");
            return;
        }
        try {
            // Create Date object (noon UTC to be safe, prevents timezone rollbacks often)
            const newDateObj = new Date(editDate + 'T12:00:00');
            await updateEvent(selectedEvent.id, { date: newDateObj });
            Alert.alert("Success", "Date Updated");
            loadEvents(); // Refresh
        } catch (e) {
            Alert.alert("Error", "Failed to update date");
        }
    };

    const saveLockStatus = async (status) => {
        if (!selectedEvent) return;
        try {
            const val = status === 'auto' ? null : status;
            await updateEvent(selectedEvent.id, { lockOverride: val });
            setEditLockOverride(status); // Optimistic

            // Local update for immediate UI feel if needed, but loadEvents will sync eventually
            const updatedEvent = { ...selectedEvent, lockOverride: val };
            setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
            setSelectedEvent(updatedEvent);
        } catch (e) {
            Alert.alert("Error", "Failed to update lock status");
        }
    };

    const handleCreateEvent = async () => {
        if (!newEventName.trim() || !newEventDate.trim()) {
            Alert.alert("Missing Info", "Name and Date are required.");
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newEventDate)) {
            Alert.alert("Invalid Date", "Use YYYY-MM-DD");
            return;
        }

        try {
            const newEvent = await createNewEvent(newEventName.trim(), newEventDate.trim());
            setEvents([...events, newEvent]);
            setSelectedEvent(newEvent);
            setCreateEventVisible(false);
            setNewEventName('');
            setNewEventDate('');
            Alert.alert("Success", "Event Created!");
        } catch (e) {
            Alert.alert("Error", e.message);
        }
    };

    const openReorderEventsModal = () => {
        setTempEvents([...events]);
        setReorderEventsVisible(true);
    };

    const moveEvent = (index, direction) => {
        const newEvents = [...tempEvents];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newEvents.length) return;

        // Swap
        const temp = newEvents[index];
        newEvents[index] = newEvents[targetIndex];
        newEvents[targetIndex] = temp;
        setTempEvents(newEvents);
    };

    const saveEventOrder = async () => {
        try {
            await reorderEvents(tempEvents);
            setEvents(tempEvents);
            setReorderEventsVisible(false);
            Alert.alert("Success", "Event order saved!");
        } catch (e) {
            Alert.alert("Error", "Failed to reorder events");
        }
    };

    const loadEvents = async () => {
        setLoading(true);
        const data = await fetchActiveAwardsEvents();
        setEvents(data);
        if (data.length > 0 && !selectedEvent) setSelectedEvent(data[0]);
        setLoading(false);
    };

    const handleAddCategoryPrompt = () => {
        if (!selectedEvent) return;

        // Simple customized Alert for now (ActionSheet better for iOS, but want cross-platform simple)
        // For Android/iOS robust selection, we'd use a Modal. 
        // For this hackathon speed, I'll alert with instructions or just pick one for demo? 
        // Better: Show a Modal list. 
        // Let's implement a simple inline list view switch temporarily or use Alert.alert options if few. 
        // Actually, let's just make a new View state for "CategorySelectionMode".
        setCategorySelectionMode(true);
    };

    const [categorySelectionMode, setCategorySelectionMode] = useState(false);
    const [customCategoryName, setCustomCategoryName] = useState('');

    const handleAddCategory = async (catType) => {
        try {
            // Check if already exists to toggle off
            const existingCat = selectedEvent.categories.find(c => c.awardsRatingKey === catType.key);

            if (existingCat) {
                // REMOVE (Toggle Off)
                Alert.alert("Remove Category", `Remove ${catType.name}?`, [
                    { text: "Cancel" },
                    {
                        text: "Remove", style: 'destructive', onPress: async () => {
                            await removeCategoryFromEvent(selectedEvent.id, existingCat.id);
                            // Local update
                            const updatedCategories = selectedEvent.categories.filter(c => c.id !== existingCat.id);
                            const updatedEvent = { ...selectedEvent, categories: updatedCategories };

                            setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
                            setSelectedEvent(updatedEvent);
                        }
                    }
                ]);
            } else {
                // ADD (Toggle On)
                const newId = catType.key.toLowerCase().replace(/ /g, '_') + '_' + Date.now();
                const newCategory = {
                    id: newId,
                    name: catType.name,
                    awardsRatingKey: catType.key,
                    nominees: []
                };

                await addCategoryToEvent(selectedEvent.id, newCategory);

                // Local update
                const updatedCategories = [...selectedEvent.categories, newCategory];
                const updatedEvent = { ...selectedEvent, categories: updatedCategories };

                setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
                setSelectedEvent(updatedEvent);
                // Don't close modal, allow multiple toggles
            }

        } catch (e) {
            Alert.alert("Error", e.message);
        }
    };

    const handleAddCustomCategory = async () => {
        const name = customCategoryName.trim();
        if (!name) return;

        try {
            const newId = 'custom_' + Date.now();
            const newCategory = {
                id: newId,
                name: name,
                awardsRatingKey: name, // Use name as key for custom
                nominees: []
            };

            await addCategoryToEvent(selectedEvent.id, newCategory);

            // Local update
            const updatedCategories = [...selectedEvent.categories, newCategory];
            const updatedEvent = { ...selectedEvent, categories: updatedCategories };

            setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
            setSelectedEvent(updatedEvent);

            setCustomCategoryName('');
            Alert.alert("Success", `Added "${name}"`);

        } catch (e) {
            Alert.alert("Error", "Failed to add custom category");
        }
    };

    const handleRemoveCategory = async () => {
        if (!selectedCategory) return;
        Alert.alert("Delete Category", `Are you sure you want to remove ${selectedCategory.name}?`, [
            { text: "Cancel" },
            {
                text: "Delete", style: 'destructive', onPress: async () => {
                    try {
                        await removeCategoryFromEvent(selectedEvent.id, selectedCategory.id);
                        // Local update
                        const updatedCategories = selectedEvent.categories.filter(c => c.id !== selectedCategory.id);
                        const updatedEvent = { ...selectedEvent, categories: updatedCategories };

                        setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
                        setSelectedEvent(updatedEvent);
                        setSelectedCategory(null);
                    } catch (e) {
                        Alert.alert("Error", "Failed to delete");
                    }
                }
            }
        ]);
    };

    const handleSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const results = await searchMovies(query);
            setSearchResults(results);
        } catch (e) {
            console.error(e);
        } finally {
            setSearching(false);
        }
    };

    // Nominee Entry State
    const [nomineeEntryVisible, setNomineeEntryVisible] = useState(false);
    const [pendingMovie, setPendingMovie] = useState(null);
    const [nomineeNameInput, setNomineeNameInput] = useState('');
    const [isEditingNominee, setIsEditingNominee] = useState(false); // New: vs Adding

    // Open Modal for New Add
    const handleAddNomineePrompt = (movie) => {
        setPendingMovie(movie);
        setNomineeNameInput(''); // Default empty or "Cast"
        setIsEditingNominee(false);
        setNomineeEntryVisible(true);
    };

    // Open Modal for Edit
    const handleEditNomineePrompt = (nominee) => {
        setPendingMovie(nominee); // Reusing pendingMovie state for the object being edited
        setNomineeNameInput(nominee.name !== 'N/A' ? nominee.name : '');
        setIsEditingNominee(true);
        setNomineeEntryVisible(true);
    };

    const confirmNomineeEntry = async () => {
        if (!selectedEvent || !selectedCategory || !pendingMovie) return;

        const finalName = nomineeNameInput.trim() || "N/A";

        try {
            if (isEditingNominee) {
                // EDIT EXISTING
                // Identify by unique ID if available, else fallback to musicId
                const targetId = pendingMovie.id || pendingMovie.musicId;

                await updateNominee(selectedEvent.id, selectedCategory.id, targetId, { name: finalName });

                // Local Update
                const updatedCat = {
                    ...selectedCategory,
                    nominees: selectedCategory.nominees.map(n => {
                        const isMatch = n.id ? n.id === targetId : n.musicId === targetId;
                        return isMatch ? { ...n, name: finalName } : n;
                    })
                };
                const updatedEvent = {
                    ...selectedEvent,
                    categories: selectedEvent.categories.map(c => c.id === selectedCategory.id ? updatedCat : c)
                };
                setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
                setSelectedEvent(updatedEvent);
                setSelectedCategory(updatedCat);

                Alert.alert("Success", "Nominee updated.");
            } else {
                // ADD NEW
                // Generate a unique ID to allow duplicates of same movie
                const uniqueId = `${pendingMovie.id}_${Date.now()}`;

                const nominee = {
                    id: uniqueId,
                    musicId: pendingMovie.id,
                    title: pendingMovie.title,
                    name: finalName,
                    poster_path: pendingMovie.poster_path
                };

                await addNomineeToCategory(selectedEvent.id, selectedCategory.id, nominee);
                Alert.alert("Success", `Added ${pendingMovie.title}`);

                // Local update
                const updatedCat = {
                    ...selectedCategory,
                    nominees: [...(selectedCategory.nominees || []), nominee]
                };
                const updatedEvent = {
                    ...selectedEvent,
                    categories: selectedEvent.categories.map(c => c.id === selectedCategory.id ? updatedCat : c)
                };

                setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
                setSelectedEvent(updatedEvent);
                setSelectedCategory(updatedCat);
                setQuery('');
                setSearchResults([]);
            }
            setNomineeEntryVisible(false);

        } catch (e) {
            Alert.alert("Error", "Failed to save nominee.");
        }
    };


    // REORDER LOGIC
    const [reorderVisible, setReorderVisible] = useState(false);
    const [tempCategories, setTempCategories] = useState([]);

    const openReorderModal = () => {
        if (!selectedEvent) return;
        setTempCategories([...selectedEvent.categories]);
        setReorderVisible(true);
    };

    const moveCategory = (index, direction) => {
        const newCats = [...tempCategories];
        const targetIndex = index + direction;

        if (targetIndex < 0 || targetIndex >= newCats.length) return;

        // Swap
        const temp = newCats[index];
        newCats[index] = newCats[targetIndex];
        newCats[targetIndex] = temp;
        setTempCategories(newCats);
    };

    const saveReorder = async () => {
        try {
            await reorderCategories(selectedEvent.id, tempCategories);

            // Local update
            const updatedEvent = { ...selectedEvent, categories: tempCategories };
            setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
            setSelectedEvent(updatedEvent);

            setReorderVisible(false);
            Alert.alert("Success", "Category order saved.");
        } catch (e) {
            Alert.alert("Error", "Failed to save order");
        }
    };

    const handleRemoveNominee = async (nomineeId) => {
        Alert.alert(
            "Confirm Delete",
            "Remove this nominee?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete", style: "destructive", onPress: async () => {
                        try {
                            await removeNomineeFromCategory(selectedEvent.id, selectedCategory.id, nomineeId);

                            const updatedCat = {
                                ...selectedCategory,
                                nominees: selectedCategory.nominees.filter(n => (n.id ? n.id !== nomineeId : n.musicId !== nomineeId))
                            };
                            const updatedEvent = {
                                ...selectedEvent,
                                categories: selectedEvent.categories.map(c => c.id === selectedCategory.id ? updatedCat : c)
                            };
                            setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
                            setSelectedEvent(updatedEvent);
                            setSelectedCategory(updatedCat);

                        } catch (e) {
                            Alert.alert("Error", "Failed to remove.");
                        }
                    }
                }
            ]
        );
    };

    const handleToggleWinner = async (nomineeId) => {
        if (!selectedEvent || !selectedCategory) return;

        // Check if already is winner to toggle off (optional, or just re-set)
        // Check new winnerId first, fallback to winnerTmdbId
        const isCurrentWinner = selectedCategory.winnerId
            ? selectedCategory.winnerId === nomineeId
            : selectedCategory.winnerTmdbId === nomineeId;

        const newWinnerId = isCurrentWinner ? null : nomineeId;

        try {
            await markCategoryWinner(selectedEvent.id, selectedCategory.id, newWinnerId);

            // Local update
            const updatedCat = { ...selectedCategory, winnerId: newWinnerId };
            const updatedEvent = {
                ...selectedEvent,
                categories: selectedEvent.categories.map(c => c.id === selectedCategory.id ? updatedCat : c)
            };

            setEvents(events.map(e => e.id === selectedEvent.id ? updatedEvent : e));
            setSelectedEvent(updatedEvent);
            setSelectedCategory(updatedCat);

            Alert.alert("Success", isCurrentWinner ? "Winner Removed" : "Winner Crowned!", null, { cancelable: true });
        } catch (e) {
            Alert.alert("Error", "Failed to set winner.");
        }
    };

    const renderNominee = ({ item }) => {
        // Winner Check: prefer winnerId, fallback to musicId
        const isWinner = selectedCategory?.winnerId
            ? selectedCategory.winnerId === item.id
            : selectedCategory?.winnerTmdbId === item.musicId;

        // Identifier for actions: use unique ID if available, else musicId
        const identifier = item.id || item.musicId;

        return (
            <View style={[styles.nomineeItem, isWinner && { borderColor: '#FFD700', borderWidth: 2, backgroundColor: '#2a2a00' }]}>
                <Image source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }} style={styles.nomineeThumb} />
                <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Text style={styles.nomineeTitle}>{item.title}</Text>
                    <Text style={{ color: '#aaa', fontSize: 12 }}>{item.name}</Text>
                    {isWinner && <Text style={{ color: '#FFD700', fontWeight: 'bold', fontSize: 12 }}>WINNER</Text>}
                </View>

                {/* Edit Button */}
                <TouchableOpacity onPress={() => handleEditNomineePrompt(item)} style={{ padding: 10 }}>
                    <Icon name="pencil" size={20} color="#888" />
                </TouchableOpacity>

                {/* Crown Button */}
                <TouchableOpacity onPress={() => handleToggleWinner(identifier)} style={{ padding: 10, marginRight: 5 }}>
                    <Icon name="trophy" size={20} color={isWinner ? "#FFD700" : "#555"} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleRemoveNominee(identifier)} style={styles.deleteBtn}>
                    <Icon name="trash" size={20} color="red" />
                </TouchableOpacity>
            </View>
        );
    };

    const renderSearchResult = ({ item }) => (
        <TouchableOpacity style={styles.searchItem} onPress={() => handleAddNomineePrompt(item)}>
            <Image source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }} style={styles.searchThumb} />
            <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.searchTitle}>{item.title} ({item.release_date?.substring(0, 4)})</Text>
            </View>
            <Icon name="plus-circle" size={24} color="#00E676" />
        </TouchableOpacity>
    );

    // Render Category Picker Modal View
    if (categorySelectionMode) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setCategorySelectionMode(false)}><Text style={{ color: '#fff' }}>Cancel</Text></TouchableOpacity>
                    <Text style={styles.headerTitle}>Add Category</Text>
                    <View style={{ width: 30 }} />
                </View>
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                    {/* Custom Input */}
                    <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                        <TextInput
                            style={styles.input}
                            placeholder="Custom Category Name..."
                            placeholderTextColor="#666"
                            value={customCategoryName}
                            onChangeText={setCustomCategoryName}
                        />
                        <TouchableOpacity onPress={handleAddCustomCategory} style={styles.searchBtn}>
                            <Icon name="plus" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <Text style={{ color: '#888', marginBottom: 10, fontSize: 12 }}>Standard Categories (Tap to Toggle)</Text>

                    {STANDARD_CATEGORIES.map((cat, idx) => {
                        const isAdded = selectedEvent.categories.some(c => c.awardsRatingKey === cat.key);
                        return (
                            <TouchableOpacity key={idx} style={styles.catOption} onPress={() => handleAddCategory(cat)}>
                                <Text style={[styles.catOptionText, isAdded && { color: '#e50914', fontWeight: 'bold' }]}>{cat.name}</Text>
                                <Icon name={isAdded ? "check-circle" : "circle-o"} size={20} color={isAdded ? "#e50914" : "#555"} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="close" size={24} color="#fff" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Nominee Manager</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.content}>
                {/* 1. Event Selector & Settings */}
                <View style={styles.selectorRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                            <Text style={styles.label}>Event:</Text>
                            <TouchableOpacity onPress={openReorderEventsModal}>
                                <Text style={{ color: '#888', fontSize: 10, fontWeight: 'bold' }}>REORDER</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => setShowSettings(!showSettings)}>
                            <Icon name="cog" size={20} color={showSettings ? "#e50914" : "#888"} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                        {/* CREATE BUTTON */}
                        <TouchableOpacity
                            style={[styles.chip, { backgroundColor: '#222', borderColor: '#444', borderWidth: 1 }]}
                            onPress={() => setCreateEventVisible(true)}
                        >
                            <Text style={[styles.chipText, { color: '#00E676', fontWeight: 'bold' }]}>
                                + NEW
                            </Text>
                        </TouchableOpacity>

                        {events.map(ev => (
                            <TouchableOpacity
                                key={ev.id}
                                style={[styles.chip, selectedEvent?.id === ev.id && styles.chipActive]}
                                onPress={() => { setSelectedEvent(ev); setSelectedCategory(null); }}
                            >
                                <Text style={[styles.chipText, selectedEvent?.id === ev.id && styles.chipTextActive]}>
                                    {ev.name.replace("Awards", "").trim()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* EVENT SETTINGS PANEL */}
                    {showSettings && selectedEvent && (
                        <View style={styles.settingsPanel}>
                            <Text style={styles.settingsHeader}>Event Settings</Text>

                            <Text style={styles.settingsLabel}>Event Date (YYYY-MM-DD):</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                <TextInput
                                    style={styles.settingsInput}
                                    value={editDate}
                                    onChangeText={setEditDate}
                                    placeholder="2026-03-01"
                                    placeholderTextColor="#555"
                                />
                                <TouchableOpacity onPress={saveDate} style={styles.miniBtn}>
                                    <Text style={{ color: '#fff', fontSize: 10 }}>SAVE</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.settingsLabel}>Lock Status Override:</Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#333', borderRadius: 8, padding: 2 }}>
                                {['auto', 'open', 'closed'].map((opt) => (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[
                                            styles.toggleBtn,
                                            (editLockOverride === opt || (!editLockOverride && opt === 'auto')) && styles.toggleBtnActive
                                        ]}
                                        onPress={() => saveLockStatus(opt)}
                                    >
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{opt.toUpperCase()}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={{ color: '#666', fontSize: 10, marginTop: 5, textAlign: 'center' }}>
                                Auto = 6PM Day-of Rule. Open/Closed forces it.
                            </Text>

                            <View style={{ height: 1, backgroundColor: '#444', marginVertical: 15 }} />

                            <TouchableOpacity
                                style={{ backgroundColor: '#222', borderColor: '#ff0000', borderWidth: 1, padding: 10, borderRadius: 5, alignItems: 'center' }}
                                onPress={() => {
                                    Alert.alert(
                                        "Delete Event",
                                        `Permanently delete "${selectedEvent.name}"? This cannot be undone.`,
                                        [
                                            { text: "Cancel", style: "cancel" },
                                            {
                                                text: "DELETE",
                                                style: "destructive",
                                                onPress: async () => {
                                                    try {
                                                        await deleteEvent(selectedEvent.id);
                                                        setEvents(events.filter(e => e.id !== selectedEvent.id));
                                                        setSelectedEvent(null);
                                                        setSelectedCategory(null);
                                                        Alert.alert("Deleted", "Event removed.");
                                                    } catch (e) {
                                                        Alert.alert("Error", "Could not delete event");
                                                    }
                                                }
                                            }
                                        ]
                                    );
                                }}
                            >
                                <Text style={{ color: '#ff0000', fontWeight: 'bold' }}>DELETE EVENT PERMANENTLY</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* 2. Category Selector */}
                {selectedEvent && (
                    <View style={styles.selectorRow}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={styles.label}>Category:</Text>
                            <View style={{ flexDirection: 'row', gap: 15, marginBottom: 5 }}>
                                <TouchableOpacity onPress={openReorderModal}>
                                    <Text style={{ color: '#888', fontSize: 12, fontWeight: 'bold' }}>REORDER</Text>
                                </TouchableOpacity>
                                {/* ADD CATEGORY BUTTON */}
                                <TouchableOpacity onPress={handleAddCategoryPrompt}>
                                    <Text style={{ color: '#e50914', fontSize: 12, fontWeight: 'bold' }}>+ ADD NEW</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {selectedEvent.categories.map(cat => (
                                <TouchableOpacity
                                    key={cat.id}
                                    style={[styles.chip, selectedCategory?.id === cat.id && styles.chipActive]}
                                    onPress={() => setSelectedCategory(cat)}
                                >
                                    <Text style={[styles.chipText, selectedCategory?.id === cat.id && styles.chipTextActive]}>{cat.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* 3. Main Area: List or Search */}
                {selectedCategory ? (
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <Text style={styles.sectionHeader}>{selectedCategory.name}</Text>
                            {/* DELETE CATEGORY BUTTON */}
                            <TouchableOpacity onPress={handleRemoveCategory}>
                                <Icon name="trash" size={18} color="#666" />
                            </TouchableOpacity>
                        </View>

                        {/* INPUT */}
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Search movie to add..."
                                placeholderTextColor="#666"
                                value={query}
                                onChangeText={setQuery}
                                onSubmitEditing={handleSearch}
                            />
                            <TouchableOpacity onPress={handleSearch} style={styles.searchBtn}>
                                <Icon name="search" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {searching && <ActivityIndicator color="#e50914" />}

                        {/* Search Results OR Current List */}
                        {searchResults.length > 0 ? (
                            <FlatList
                                data={searchResults}
                                renderItem={renderSearchResult}
                                keyExtractor={item => item.id.toString()}
                                style={styles.list}
                            />
                        ) : (
                            <FlatList
                                data={selectedCategory.nominees || []}
                                renderItem={renderNominee}
                                keyExtractor={item => item.id || item.musicId.toString()}
                                style={styles.list}
                                ListEmptyComponent={<Text style={styles.emptyText}>No nominees yet.</Text>}
                            />
                        )}

                        {searchResults.length > 0 && (
                            <TouchableOpacity onPress={() => { setSearchResults([]); setQuery(''); }} style={styles.clearSearchBtn}>
                                <Text style={{ color: '#fff' }}>Close Search Results</Text>
                            </TouchableOpacity>
                        )}

                    </View>
                ) : (
                    <View style={styles.center}>
                        <Text style={{ color: '#666' }}>Select an Event and Category to manage nominees.</Text>
                    </View>
                )}
            </View>

            {/* NOMINEE ENTRY MODAL */}
            <Modal
                visible={nomineeEntryVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setNomineeEntryVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {isEditingNominee ? "Edit Nominee" : "Add Nominee"}
                        </Text>
                        <Text style={{ color: '#aaa', marginBottom: 5 }}>
                            {pendingMovie?.title} ({pendingMovie?.release_date?.substring(0, 4) || 'N/A'})
                        </Text>

                        <Text style={{ color: '#ddd', marginBottom: 5, fontSize: 12 }}>Description / Actor Name:</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="e.g. Timothée Chalamet"
                            placeholderTextColor="#555"
                            value={nomineeNameInput}
                            onChangeText={setNomineeNameInput}
                            autoFocus={true}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity
                                onPress={() => setNomineeEntryVisible(false)}
                                style={{ padding: 10 }}
                            >
                                <Text style={{ color: '#888' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={confirmNomineeEntry}
                                style={{ backgroundColor: '#e50914', padding: 10, borderRadius: 5 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                                    {isEditingNominee ? "Save Changes" : "Add Nominee"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* REORDER MODAL */}
            <Modal
                visible={reorderVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setReorderVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { height: '80%' }]}>
                        <Text style={styles.modalTitle}>Reorder Categories</Text>
                        <Text style={{ color: '#666', marginBottom: 15, fontSize: 12 }}>Use arrows to move categories up or down.</Text>

                        <FlatList
                            data={tempCategories}
                            keyExtractor={item => item.id}
                            renderItem={({ item, index }) => (
                                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#333', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff' }}>{item.name}</Text>
                                        <Text style={{ color: '#555', fontSize: 10 }}>{item.nominees?.length || 0} nominees</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <TouchableOpacity onPress={() => moveCategory(index, -1)} style={{ padding: 10 }} disabled={index === 0}>
                                            <Icon name="arrow-up" size={18} color={index === 0 ? "#333" : "#fff"} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => moveCategory(index, 1)} style={{ padding: 10 }} disabled={index === tempCategories.length - 1}>
                                            <Icon name="arrow-down" size={18} color={index === tempCategories.length - 1 ? "#333" : "#fff"} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 15 }}>
                            <TouchableOpacity
                                onPress={() => setReorderVisible(false)}
                                style={{ padding: 10 }}
                            >
                                <Text style={{ color: '#888' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveReorder}
                                style={{ backgroundColor: '#e50914', padding: 10, borderRadius: 5 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save Order</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>


            <Modal
                visible={createEventVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setCreateEventVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Create New Event</Text>

                        <Text style={{ color: '#ccc', marginBottom: 5 }}>Event Name:</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="e.g. 2027 Oscars"
                            placeholderTextColor="#555"
                            value={newEventName}
                            onChangeText={setNewEventName}
                        />

                        <Text style={{ color: '#ccc', marginBottom: 5 }}>Date (YYYY-MM-DD):</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="e.g. 2027-02-28"
                            placeholderTextColor="#555"
                            value={newEventDate}
                            onChangeText={setNewEventDate}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 15 }}>
                            <TouchableOpacity
                                onPress={() => setCreateEventVisible(false)}
                                style={{ padding: 10 }}
                            >
                                <Text style={{ color: '#888' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleCreateEvent}
                                style={{ backgroundColor: '#e50914', padding: 10, borderRadius: 5 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Event</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>



            {/* REORDER EVENTS MODAL */}
            <Modal
                visible={reorderEventsVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setReorderEventsVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { height: '80%' }]}>
                        <Text style={styles.modalTitle}>Reorder Events</Text>
                        <Text style={{ color: '#666', marginBottom: 15, fontSize: 12 }}>Use arrows to move events up or down.</Text>

                        <FlatList
                            data={tempEvents}
                            keyExtractor={item => item.id}
                            renderItem={({ item, index }) => (
                                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#333', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff' }}>{item.name}</Text>
                                        <Text style={{ color: '#555', fontSize: 10 }}>{item.date?.seconds ? new Date(item.date.seconds * 1000).getFullYear() : ''}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <TouchableOpacity onPress={() => moveEvent(index, -1)} style={{ padding: 10 }} disabled={index === 0}>
                                            <Icon name="arrow-up" size={18} color={index === 0 ? "#333" : "#fff"} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => moveEvent(index, 1)} style={{ padding: 10 }} disabled={index === tempEvents.length - 1}>
                                            <Icon name="arrow-down" size={18} color={index === tempEvents.length - 1 ? "#333" : "#fff"} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 15 }}>
                            <TouchableOpacity
                                onPress={() => setReorderEventsVisible(false)}
                                style={{ padding: 10 }}
                            >
                                <Text style={{ color: '#888' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveEventOrder}
                                style={{ backgroundColor: '#e50914', padding: 10, borderRadius: 5 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save Order</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', backgroundColor: '#1a1a1a' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    content: { flex: 1, padding: 15 },

    selectorRow: { marginBottom: 15 },
    label: { color: '#888', marginBottom: 5, fontSize: 12, textTransform: 'uppercase' },
    chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#333', borderRadius: 15, marginRight: 8 },
    chipActive: { backgroundColor: '#e50914' },
    chipText: { color: '#bbb', fontSize: 13 },
    chipTextActive: { color: '#fff', fontWeight: 'bold' },

    sectionHeader: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    inputContainer: { flexDirection: 'row', marginBottom: 15 },
    input: { flex: 1, backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, marginRight: 10 },
    searchBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8, justifyContent: 'center' },

    list: { flex: 1 },
    nomineeItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', marginBottom: 10, padding: 10, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#e50914' },
    nomineeThumb: { width: 40, height: 60, borderRadius: 4, backgroundColor: '#333' },
    nomineeTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    deleteBtn: { padding: 10 },

    searchItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', marginBottom: 10, padding: 10, borderRadius: 8 },
    searchThumb: { width: 40, height: 60, borderRadius: 4 },
    searchTitle: { color: '#ddd', fontSize: 14 },

    emptyText: { color: '#555', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
    clearSearchBtn: { padding: 15, backgroundColor: '#333', alignItems: 'center', marginTop: 10, borderRadius: 8 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Category options
    catOption: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#333', flexDirection: 'row', justifyContent: 'space-between' },
    catOptionText: { color: '#fff', fontSize: 16 },

    // Settings Panel
    settingsPanel: { marginTop: 15, backgroundColor: '#222', padding: 10, borderRadius: 8 },
    settingsHeader: { color: '#e50914', fontWeight: 'bold', marginBottom: 10 },
    settingsLabel: { color: '#888', fontSize: 10, marginBottom: 5 },
    settingsInput: { flex: 1, backgroundColor: '#111', color: '#fff', padding: 8, borderRadius: 5, marginRight: 10 },
    miniBtn: { backgroundColor: '#e50914', paddingHorizontal: 10, justifyContent: 'center', borderRadius: 5 },
    toggleBtn: { flex: 1, padding: 8, alignItems: 'center' },
    toggleBtnActive: { backgroundColor: '#e50914', borderRadius: 6 },

    // Modal
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { width: '80%', backgroundColor: '#222', borderRadius: 10, padding: 20 },
    modalTitle: { color: '#e50914', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    modalInput: { backgroundColor: '#111', color: '#fff', padding: 10, borderRadius: 5, marginBottom: 15 }

});

export default AdminAwardsScreen;
