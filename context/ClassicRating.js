import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import Slider from '@react-native-community/slider';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

// Configuration
const MAX_RATING = 10;
const MIN_RATING = 0;
const RATING_INCREMENT = 0.1;

const screenWidth = Dimensions.get('window').width;

// Colors (Light/Gold Theme)
const COLOR_BACKGROUND_CARD = '#FFFFFF';
const COLOR_BACKGROUND_DISPLAY = '#F2F2F2';
const COLOR_TEXT_PRIMARY = '#333333';
const COLOR_TEXT_SECONDARY = '#666666';
const COLOR_TEXT_RATING_VALUE = '#d4a03e'; // TOPO Gold
const COLOR_SLIDER_TRACK_MIN = '#d4a03e';
const COLOR_SLIDER_TRACK_MAX = '#E0E0E0';
const COLOR_SLIDER_THUMB = '#d4a03e';
const COLOR_BUTTON_GRID_BG = '#F0F0F0';
const COLOR_BUTTON_GRID_BG_ACTIVE = '#d4a03e';
const COLOR_BUTTON_GRID_TEXT = '#333333';
const COLOR_BUTTON_GRID_TEXT_ACTIVE = '#FFFFFF';
const COLOR_SUBMIT_BUTTON_BG = '#d4a03e';
const COLOR_SUBMIT_BUTTON_TEXT = '#FFFFFF';
const COLOR_CANCEL_BUTTON_BG = '#E0E0E0';
const COLOR_CANCEL_BUTTON_TEXT = '#333333';

const RATING_DESCRIPTIONS = [
    { value: 0, label: "Do Not Listen", short: "DNL" },
    { value: 1, label: "Awful", short: "Awful" },
    { value: 2, label: "Bad", short: "Bad" },
    { value: 3, label: "Poor", short: "Poor" },
    { value: 4, label: "Listenable", short: "Listenable" },
    { value: 5, label: "Fair", short: "Fair" },
    { value: 6, label: "Good", short: "Good" },
    { value: 7, label: "More Than Good", short: "MTG" },
    { value: 8, label: "Very Good", short: "Very Good" },
    { value: 9, label: "Excellent", short: "Excellent" },
    { value: 10, label: "Perfect", short: "Perfect" },
];

const ClassicRating = ({ initialRating = 0, onSubmitRating = () => { }, onCancel, artistName, albumArtwork, isPlayed, onTogglePlayed }) => {
    const [rating, setRating] = useState(parseFloat(initialRating.toFixed(1)));

    const getRatingLabel = (currentRating) => {
        const roundedRating = Math.floor(currentRating);
        const desc = RATING_DESCRIPTIONS.find(d => d.value === roundedRating);
        return desc ? desc.short.toUpperCase() : "";
    };

    const handleRatingButtonPress = (value) => {
        setRating(parseFloat(value.toFixed(1)));
    };

    const handleSubmit = () => {
        onSubmitRating(rating);
    };

    return (
        <View style={styles.card}>
            <Text style={styles.title}>Rate {artistName || 'Artist'}</Text>
            {albumArtwork && (
                <Image source={{ uri: albumArtwork }} style={styles.coverArt} resizeMode="contain" />
            )}

            <View style={styles.ratingDisplayArea}>
                <Text style={styles.ratingValueText}>{rating.toFixed(1)}</Text>
                <Text style={styles.ratingLabelText}>{getRatingLabel(rating)}</Text>
            </View>

            {/* Native Slider */}
            <View style={styles.sliderContainer}>
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={MIN_RATING}
                    maximumValue={MAX_RATING}
                    step={RATING_INCREMENT}
                    value={rating}
                    onValueChange={(val) => setRating(parseFloat(val.toFixed(1)))}
                    minimumTrackTintColor={COLOR_SLIDER_TRACK_MIN}
                    maximumTrackTintColor={COLOR_SLIDER_TRACK_MAX}
                    thumbTintColor={COLOR_SLIDER_THUMB}
                />

                <View style={styles.sliderLabelsContainer}>
                    {[0, 2, 4, 6, 8, 10].map((num) => (
                        <Text key={`label-${num}`} style={styles.sliderLabel}>{num}</Text>
                    ))}
                </View>
            </View>

            {/* Rating Buttons Grid */}
            <View style={styles.buttonsGrid}>
                {RATING_DESCRIPTIONS.map((desc) => (
                    <TouchableOpacity
                        key={`btn-${desc.value}`}
                        style={[
                            styles.gridButton,
                            Math.floor(rating) === desc.value && styles.gridButtonActive,
                        ]}
                        onPress={() => handleRatingButtonPress(desc.value)}
                    >
                        <Text style={[styles.gridButtonValue, Math.floor(rating) === desc.value && styles.gridButtonTextActive]}>{desc.value}</Text>
                        <Text style={[styles.gridButtonLabel, Math.floor(rating) === desc.value && styles.gridButtonTextActive]}>{desc.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity
                style={[styles.playedToggle, isPlayed && styles.playedToggleActive]}
                onPress={onTogglePlayed}
            >
                <MaterialCommunityIcons
                    name={isPlayed ? "check-circle" : "circle-outline"}
                    size={20}
                    color={isPlayed ? "#FFFFFF" : COLOR_CANCEL_BUTTON_TEXT}
                />
                <Text style={[styles.playedToggleText, isPlayed && styles.playedToggleTextActive]}>
                    Press to Add to Recently played
                </Text>
            </TouchableOpacity>

            <View style={styles.buttonsRow}>
                {onCancel && (
                    <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                    <Text style={styles.submitButtonText}>Submit Rating</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        alignItems: 'center',
        width: '100%',
    },
    title: {
        fontSize: screenWidth * 0.06,
        fontWeight: 'bold',
        color: COLOR_TEXT_PRIMARY,
        marginBottom: 10,
    },
    coverArt: {
        width: screenWidth * 0.3,
        height: screenWidth * 0.3,
        borderRadius: 10,
        marginBottom: 15,
    },
    ratingDisplayArea: {
        backgroundColor: COLOR_BACKGROUND_DISPLAY,
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 25,
        width: '100%',
    },
    ratingValueText: {
        fontSize: screenWidth * 0.12,
        fontWeight: 'bold',
        color: COLOR_TEXT_RATING_VALUE,
    },
    ratingLabelText: {
        fontSize: screenWidth * 0.045,
        color: COLOR_TEXT_PRIMARY,
        fontWeight: '600',
        marginTop: 5,
        textTransform: 'uppercase',
    },
    sliderContainer: {
        width: '100%',
        marginBottom: 25,
        alignItems: 'center',
    },
    sliderLabelsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 5,
        paddingHorizontal: 10,
    },
    sliderLabel: {
        fontSize: screenWidth * 0.03,
        color: COLOR_TEXT_SECONDARY,
    },
    buttonsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 30,
    },
    gridButton: {
        backgroundColor: COLOR_BUTTON_GRID_BG,
        width: '23%',
        aspectRatio: 1.2,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 5,
        marginBottom: screenWidth * 0.02,
    },
    gridButtonActive: {
        backgroundColor: COLOR_BUTTON_GRID_BG_ACTIVE,
    },
    gridButtonValue: {
        fontSize: screenWidth * 0.05,
        fontWeight: 'bold',
        color: COLOR_BUTTON_GRID_TEXT,
    },
    gridButtonLabel: {
        fontSize: screenWidth * 0.025,
        color: COLOR_BUTTON_GRID_TEXT,
        textAlign: 'center',
        marginTop: 3,
    },
    gridButtonTextActive: {
        color: COLOR_BUTTON_GRID_TEXT_ACTIVE,
    },
    buttonsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        gap: 10,
    },
    cancelButton: {
        backgroundColor: COLOR_CANCEL_BUTTON_BG,
        paddingVertical: 12,
        borderRadius: 25,
        flex: 1,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: COLOR_CANCEL_BUTTON_TEXT,
        fontSize: screenWidth * 0.04,
        fontWeight: 'bold',
    },
    submitButton: {
        backgroundColor: COLOR_SUBMIT_BUTTON_BG,
        paddingVertical: 12,
        borderRadius: 25,
        flex: 1,
        alignItems: 'center',
    },
    submitButtonText: {
        color: COLOR_SUBMIT_BUTTON_TEXT,
        fontSize: screenWidth * 0.04,
        fontWeight: 'bold',
    },
});

export default ClassicRating;
