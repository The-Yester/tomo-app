import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

const RatingInstructionsScreen = () => {
    const navigation = useNavigation();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="chevron-left" size={24} color="#ff8c00" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Rating Systems Explained</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                <Text style={styles.introText}>
                    TOMO offers multiple ways to rate music & albums so you can express your opinion exactly how you want. Choose your preferred style in Profile Settings!
                </Text>

                <View style={styles.section}>
                    <View style={styles.systemRow}>
                        <View style={styles.iconContainer}>
                            <View style={styles.classicBadge}>
                                <Text style={styles.classicText}>10</Text>
                            </View>
                        </View>
                        <View style={styles.textContainer}>
                            <Text style={styles.systemTitle}>1-10 (Classic)</Text>
                            <Text style={styles.systemDesc}>
                                The standard decimal rating. Rate albums on a scale of 1.0 to 10.0 for maximum precision.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.systemRow}>
                        <View style={styles.iconContainer}>
                            <MaterialIcon name="pizza" size={32} color="#FF5722" />
                        </View>
                        <View style={styles.textContainer}>
                            <Text style={styles.systemTitle}>Pizza Rating</Text>
                            <Text style={styles.systemDesc}>
                                A fun, casual scale from 1 to 5 slices. Because some albums are just "cheesy" good!
                            </Text>
                        </View>
                    </View>

                    <View style={styles.systemRow}>
                        <View style={styles.iconContainer}>
                            <Icon name="percent" size={28} color="#4CAF50" />
                        </View>
                        <View style={styles.textContainer}>
                            <Text style={styles.systemTitle}>Percentage</Text>
                            <Text style={styles.systemDesc}>
                                Rate from 0% to 100%. Perfect if you prefer a Rotten Tomatoes style metric.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.systemRow}>
                        <View style={styles.iconContainer}>
                            <Icon name="trophy" size={30} color="#FFD700" />
                        </View>
                        <View style={styles.textContainer}>
                            <Text style={styles.systemTitle}>Awards (Detailed)</Text>
                            <Text style={styles.systemDesc}>
                                For the critics! Rate specific categories like Sound, Lyrics, and Production. The overall score is calculated automatically.
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.separator} />

            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: '#0a0a1a',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        fontFamily: 'Trebuchet MS',
    },
    backButton: {
        padding: 5,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    introText: {
        color: '#ccc',
        fontSize: 16,
        marginBottom: 30,
        lineHeight: 24,
        textAlign: 'center',
        fontStyle: 'italic'
    },
    section: {
        marginBottom: 20,
    },
    systemRow: {
        flexDirection: 'row',
        marginBottom: 25,
        alignItems: 'flex-start',
    },
    iconContainer: {
        width: 50,
        alignItems: 'center',
        marginRight: 15,
        paddingTop: 2
    },
    textContainer: {
        flex: 1,
    },
    systemTitle: {
        color: '#ff8c00',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    systemDesc: {
        color: '#ddd',
        fontSize: 14,
        lineHeight: 20,
    },
    classicBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#FFC107',
        justifyContent: 'center',
        alignItems: 'center',
    },
    classicText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000',
    },
    separator: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 10,
        marginBottom: 30,
    },
    awardsSection: {
        backgroundColor: '#161625',
        padding: 20,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#333',
    },
    awardsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        justifyContent: 'center'
    },
    awardsSectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
    },
    awardsText: {
        color: '#eee',
        fontSize: 16,
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: '600'
    },
    bulletPoint: {
        flexDirection: 'row',
        marginBottom: 15,
        alignItems: 'flex-start',
    },
    bulletText: {
        color: '#ccc',
        fontSize: 14,
        lineHeight: 20,
        flex: 1,
    }
});

export default RatingInstructionsScreen;
