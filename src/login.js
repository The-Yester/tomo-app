import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, Image, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
// import AsyncStorage from '@react-native-async-storage/async-storage'; // Unused
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';


import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Ensure path is correct

const LoginScreen = () => {
    const [loading, setLoading] = useState(true); // Track Loading
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigation = useNavigation();

    // Animation State
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        if (loading) {
            Animated.loop(
                Animated.sequence([
                    Animated.parallel([
                        Animated.timing(fadeAnim, {
                            toValue: 1,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                        Animated.timing(scaleAnim, {
                            toValue: 1.05,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.parallel([
                        Animated.timing(fadeAnim, {
                            toValue: 0.8,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                        Animated.timing(scaleAnim, {
                            toValue: 0.95,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                    ]),
                ])
            ).start();
        }
    }, [loading]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // Determine if we are navigating away or just stopping loading
                // Ideally we fade out here but navigation breaks component unmount.
                // Just navigate directly.
                navigation.replace('MainTabs');
            } else {
                setLoading(false);
            }
        });
        return unsubscribe; // Cleanup subscription
    }, []);

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Animated.Image
                    source={require('../assets/fixed-icon.png')}
                    style={{
                        width: '60%',
                        height: '30%',
                        resizeMode: 'contain',
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }]
                    }}
                />
            </View>
        );
    }

    const handleLogin = async () => {
        try {
            // Firebase Auth Login
            await signInWithEmailAndPassword(auth, email, password);
            // Alert.alert('Success', 'Welcome to TOPO!'); // Optional, or just navigate
            navigation.navigate('MainTabs');
        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'An error occurred. Please try again.';
            if (error.code === 'auth/invalid-email') errorMessage = 'Invalid email address.';
            if (error.code === 'auth/user-not-found') errorMessage = 'No user found with this email.';
            if (error.code === 'auth/wrong-password') errorMessage = 'Incorrect password.';
            if (error.code === 'auth/invalid-credential') errorMessage = 'Invalid email or password.';
            Alert.alert('Error', errorMessage);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                    {/* 1. Top Logo Section */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/fixed-icon.png')}
                            style={styles.logoImage}
                        />
                    </View>

                    {/* 2. Form Section */}
                    <View style={styles.formContainer}>
                        <Text style={styles.tagline}>Rate | Share | Jam</Text>
                        <Text style={styles.subTagline}>& Eat Pizza! 🎧</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor="#666"
                            onChangeText={setEmail}
                            value={email}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#666"
                            secureTextEntry
                            onChangeText={setPassword}
                            value={password}
                        />

                        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                            <Text style={styles.loginButtonText}>Login</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.signupLink}>
                            <Text style={styles.signupText}>
                                Don't have an account? <Text style={styles.signupTextBold}>Sign Up</Text>
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f0f11',
    },
    logoContainer: {
        height: '40%',
        justifyContent: 'center',
        alignItems: 'center',
        // Removed paddingTop to allow true centering
    },
    logoImage: {
        width: '60%',
        height: '100%',
        resizeMode: 'contain',
        marginLeft: 20, // Visual correction to center the logo
    },
    formContainer: {
        flex: 1,
        paddingHorizontal: 25,
        justifyContent: 'flex-start', // Start from below logo
        paddingTop: 10,
    },
    mainSlogan: {
        fontSize: 14,
        fontWeight: '600',
        color: '#E0E0E0',
        textAlign: 'center',
        fontFamily: 'Trebuchet MS',
        marginBottom: 10,
        letterSpacing: 1,
        fontStyle: 'italic',
    },
    tagline: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#e9af45', // Gold brand color
        textAlign: 'center',
        fontFamily: 'Trebuchet MS',
        marginBottom: 5,
    },
    subTagline: {
        fontSize: 18,
        color: '#ccc',
        textAlign: 'center',
        fontFamily: 'Trebuchet MS',
        marginBottom: 30,
    },
    input: {
        backgroundColor: '#1a1a2e',
        color: '#fff',
        borderRadius: 12,
        paddingHorizontal: 15,
        paddingVertical: 12,
        fontSize: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    loginButton: {
        backgroundColor: '#e9af45',
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#e9af45',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    signupLink: {
        marginTop: 20,
        alignItems: 'center',
    },
    signupText: {
        color: '#888',
        fontSize: 14,
    },
    signupTextBold: {
        color: '#e9af45',
        fontWeight: 'bold',
    },
});

export default LoginScreen;
