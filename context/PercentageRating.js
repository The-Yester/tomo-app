import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, Dimensions, Animated, Image } from 'react-native';
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

// Configuration
const MAX_RATING = 100;
const MIN_RATING = 1; // Rating from 1% to 100%

const screenWidth = Dimensions.get('window').width;
const componentWidth = screenWidth * 0.9; // Width of the card

// Sizes for the circular slider
const circleRadius = componentWidth * 0.35;
const strokeWidth = componentWidth * 0.08;
const thumbRadius = strokeWidth * 0.6;
const svgSize = (circleRadius + strokeWidth) * 2;
const center = svgSize / 2;

// Colors (Light/Gold Theme Match)
const COLOR_BACKGROUND_CARD = '#FFFFFF';
const COLOR_TITLE_TEXT = '#333333';
const COLOR_SUBTITLE_TEXT = '#666666';
const COLOR_CIRCLE_TRACK = '#E0E0E0';
const COLOR_CIRCLE_PROGRESS_START = '#d4a03e'; // TOPO Gold
const COLOR_CIRCLE_PROGRESS_END = '#e6c88f';
const COLOR_THUMB = '#FFFFFF';
const COLOR_PERCENTAGE_TEXT = '#d4a03e';
const COLOR_DESCRIPTION_TEXT = '#666666';
const COLOR_CANCEL_BUTTON_BG = '#E0E0E0';
const COLOR_CANCEL_BUTTON_TEXT = '#333333';
const COLOR_SUBMIT_BUTTON_BG = '#d4a03e';
const COLOR_SUBMIT_BUTTON_TEXT = '#FFFFFF';

const RATING_DESCRIPTIONS = [
    { value: 0, label: "Do Not Watch", short: "DNW" },
    { value: 1, label: "Awful", short: "Awful" },
    { value: 2, label: "Bad", short: "Bad" },
    { value: 3, label: "Poor", short: "Poor" },
    { value: 4, label: "Watchable", short: "Watchable" },
    { value: 5, label: "Fair", short: "Fair" },
    { value: 6, label: "Good", short: "Good" },
    { value: 7, label: "More Than Good", short: "MTG" },
    { value: 8, label: "Very Good", short: "Very Good" },
    { value: 9, label: "Excellent", short: "Excellent" },
    { value: 10, label: "Perfect", short: "Perfect" },
];

const getFeedback = (percentage) => {
    // Logic: 0-10 -> 0, 11-20 -> 1, ..., 91-99 -> 9, 100 -> 10
    let scaledValue = 0;
    if (percentage === 100) {
        scaledValue = 10;
    } else {
        // (percentage - 1) / 10 ensures that 10 falls into 0 (9/10), and 11 falls into 1 (10/10)
        scaledValue = Math.floor((percentage - 1) / 10);
        if (scaledValue < 0) scaledValue = 0; // Handle 0
    }

    const desc = RATING_DESCRIPTIONS.find(d => d.value === scaledValue);

    // Add some emojis based on the score
    let emoji = '😐';
    if (scaledValue >= 9) emoji = '🤩'; // Excellent/Perfect
    else if (scaledValue >= 7) emoji = '😄'; // MTG/Very Good
    else if (scaledValue >= 5) emoji = '🙂'; // Fair/Good
    else if (scaledValue >= 3) emoji = '😟'; // Poor/Watchable
    else emoji = '💀'; // DNW - Bad

    return {
        emoji: emoji,
        text: desc ? desc.label : "Unknown"
    };
};

const angleToPercentage = (angle) => {
    let normalizedAngle = (angle + 360) % 360;
    if (normalizedAngle === 0 && currentAngleRef.current > 270) {
        normalizedAngle = 360;
    }
    let percentage = (normalizedAngle / 360) * MAX_RATING;
    return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(percentage)));
};

const percentageToAngle = (percentage) => {
    return (percentage / MAX_RATING) * 360;
};

const describeArc = (x, y, radius, startAngleDeg, endAngleDeg) => {
    const startAngleRad = ((startAngleDeg - 90) * Math.PI) / 180;
    const endAngleRad = ((endAngleDeg - 90) * Math.PI) / 180;
    const largeArcFlag = endAngleDeg - startAngleDeg <= 180 ? '0' : '1';

    const startX = x + radius * Math.cos(startAngleRad);
    const startY = y + radius * Math.sin(startAngleRad);
    const endX = x + radius * Math.cos(endAngleRad);
    const endY = y + radius * Math.sin(endAngleRad);

    if (Math.abs(startAngleDeg - endAngleDeg) >= 359.99) {
        return `M ${x} ${y - radius} A ${radius} ${radius} 0 1 1 ${x - 0.01} ${y - radius} Z`;
    }

    return [
        'M', startX, startY,
        'A', radius, radius, 0, largeArcFlag, 1, endX, endY,
    ].join(' ');
};

let currentAngleRef = { current: 0 };

const PercentageRating = ({ value = 50, onChange = () => { }, onCancel, artistName, albumArtwork, isPlayed, onTogglePlayed }) => {
    // Note: The parent component passes `onChange` which is effectively `onSubmit` in current usage for some reason?
    // Wait, in MovieDetailScreen: 
    // onChange={(newPercentage) => handleRatingSubmit(newPercentage)}
    // This submits immediately on release or change? 
    // Usually a slider updates state, then button submits.
    // Parent expects `onChange` to be the "submit" trigger currently for Percentage?
    // Let's check MovieDetailScreen usage:
    // onChange={(newPercentage) => handleRatingSubmit(newPercentage)}
    // This implies immediate submission on change which is annoyed for a slider.
    // I should change this to internal state and explicit submit.

    const [rating, setRating] = useState(Math.max(MIN_RATING, Math.min(MAX_RATING, value)));
    const animatedRating = useRef(new Animated.Value(rating)).current;

    useEffect(() => {
        Animated.timing(animatedRating, {
            toValue: rating,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [rating]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt, gestureState) => {
                updateRatingFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
            },
            onPanResponderMove: (evt, gestureState) => {
                updateRatingFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
            },
        })
    ).current;

    const updateRatingFromTouch = (touchX, touchY) => {
        const dx = touchX - center;
        const dy = touchY - center;
        let angleRad = Math.atan2(dy, dx);
        let angleDeg = (angleRad * 180) / Math.PI;

        angleDeg = (angleDeg + 90 + 360) % 360;
        currentAngleRef.current = angleDeg;

        const newRating = angleToPercentage(angleDeg);
        setRating(newRating);
    };

    const handleSubmit = () => {
        onChange(rating); // Calling the prop 'onChange' which triggers submit in parent
    };

    const currentAngle = percentageToAngle(rating);
    const feedback = getFeedback(rating);

    const thumbAngleRad = ((currentAngle - 90) * Math.PI) / 180;
    const thumbX = center + circleRadius * Math.cos(thumbAngleRad);
    const thumbY = center + circleRadius * Math.sin(thumbAngleRad);

    return (
        <View style={styles.card}>
            <Text style={styles.title}>Rate {artistName || 'Artist'}</Text>
            {albumArtwork && (
                <Image source={{ uri: albumArtwork }} style={styles.coverArt} resizeMode="contain" />
            )}

            <View style={styles.circleContainer} {...panResponder.panHandlers}>
                <Svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
                    <Defs>
                        <LinearGradient id="progressGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <Stop offset="0%" stopColor={COLOR_CIRCLE_PROGRESS_START} />
                            <Stop offset="100%" stopColor={COLOR_CIRCLE_PROGRESS_END} />
                        </LinearGradient>
                    </Defs>

                    {/* Background Track */}
                    <Circle
                        cx={center}
                        cy={center}
                        r={circleRadius}
                        stroke={COLOR_CIRCLE_TRACK}
                        strokeWidth={strokeWidth}
                        fill="none"
                    />

                    {/* Progress Arc */}
                    {rating > 0 && (
                        <Path
                            d={describeArc(center, center, circleRadius, 0, currentAngle)}
                            stroke="url(#progressGradient)"
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            fill="none"
                        />
                    )}

                    {/* Thumb */}
                    {rating > 0 && (
                        <Circle
                            cx={thumbX}
                            cy={thumbY}
                            r={thumbRadius}
                            fill={COLOR_THUMB}
                            stroke={COLOR_BACKGROUND_CARD}
                            strokeWidth={2}
                        />
                    )}

                    {/* Central Text Content */}
                    <G x={center} y={center}>
                        <SvgText
                            fontSize={componentWidth * 0.15}
                            fontWeight="bold"
                            fill={COLOR_PERCENTAGE_TEXT}
                            textAnchor="middle"
                            dy={-(componentWidth * 0.03)}
                        >
                            {`${rating}%`}
                        </SvgText>
                        <SvgText
                            fontSize={componentWidth * 0.1}
                            textAnchor="middle"
                            dy={componentWidth * 0.08}
                        >
                            {feedback.emoji}
                        </SvgText>
                        <SvgText
                            fontSize={componentWidth * 0.04}
                            fill={COLOR_DESCRIPTION_TEXT}
                            textAnchor="middle"
                            dy={componentWidth * 0.15}
                        >
                            {feedback.text}
                        </SvgText>
                    </G>
                </Svg>
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
        fontSize: componentWidth * 0.065,
        fontWeight: 'bold',
        color: COLOR_TITLE_TEXT,
        marginBottom: 10,
    },
    coverArt: {
        width: screenWidth * 0.3,
        height: screenWidth * 0.3,
        borderRadius: 10,
        marginBottom: 15,
    },
    circleContainer: {
        width: svgSize,
        height: svgSize,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
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
        fontSize: componentWidth * 0.04,
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
        fontSize: componentWidth * 0.04,
        fontWeight: 'bold',
    },
    playedToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLOR_CANCEL_BUTTON_BG,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
        width: '100%',
        marginBottom: 15,
    },
    playedToggleActive: {
        backgroundColor: COLOR_SUBMIT_BUTTON_BG,
    },
    playedToggleText: {
        color: COLOR_CANCEL_BUTTON_TEXT,
        fontSize: componentWidth * 0.035,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    playedToggleTextActive: {
        color: '#FFFFFF',
    }
});

export default PercentageRating;
