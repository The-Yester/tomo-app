import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/FontAwesome';
import Login from './src/login';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreenMusic from './screens/HomeScreenMusic';
import TrendingScreen from './screens/TrendingScreen';
import AlbumDetailScreen from './screens/AlbumDetailScreen';
import { MusicProvider } from './context/MusicContext';
import ListScreen from './screens/ListScreen';
import ListDetailScreen from './screens/ListDetailScreen';
import SearchScreenMusic from './screens/SearchScreenMusic';
import CuratedCornerScreen from './screens/CuratedCornerScreen';
import CreateCurationScreen from './screens/CreateCurationScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProfileSettings from './screens/ProfileSettings';
import 'react-native-get-random-values';
import * as Notifications from 'expo-notifications';
import { useRef, useEffect, useState } from 'react';
import { registerForPushNotificationsAsync } from './services/NotificationService';


import FollowListScreen from './screens/FollowListScreen';

import PublicProfileScreen from './screens/PublicProfileScreen';
import RatingInstructionsScreen from './screens/RatingInstructionsScreen';
import ArtistDetailScreen from './screens/ArtistDetailScreen';
import GenreDetailScreen from './screens/GenreDetailScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const createTabStack = (MainScreenName, MainComponent) => {
    const TabStack = createStackNavigator();
    const TabStackNavigator = () => (
        <TabStack.Navigator screenOptions={{ headerShown: false }}>
            <TabStack.Screen name={MainScreenName} component={MainComponent} />
            <TabStack.Screen name="AlbumDetails" component={AlbumDetailScreen} />
            <TabStack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
            <TabStack.Screen name="GenreDetail" component={GenreDetailScreen} />
            <TabStack.Screen name="ListDetails" component={ListDetailScreen} />
            <TabStack.Screen name="PublicProfile" component={PublicProfileScreen} />
            <TabStack.Screen name="ProfileSettings" component={ProfileSettings} />
            <TabStack.Screen name="FollowList" component={FollowListScreen} />
        </TabStack.Navigator>
    );
    return TabStackNavigator;
};

// Stacks for each tab
const HomeStackNavigator = createTabStack("HomeScreen", HomeScreenMusic);
const TrendingStackNavigator = createTabStack("TrendingScreen", TrendingScreen);
const ListStackNavigator = createTabStack("ListScreen", ListScreen);
const CuratedCornerStackNavigator = createTabStack("CuratedCornerScreen", CuratedCornerScreen);
const SearchStackNavigator = createTabStack("SearchScreen", SearchScreenMusic);

// Bottom tab navigator
function BottomTabs() {
    return (
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#D4AF37', tabBarInactiveTintColor: '#888', tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#DDD' } }}>
            <Tab.Screen
                name="Home"
                component={HomeStackNavigator}
                options={{ tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} /> }}
            />
            <Tab.Screen
                name="Trending"
                component={TrendingStackNavigator}
                options={{
                    tabBarLabel: 'Trending',
                    tabBarIcon: ({ color, size }) => <Icon name="fire" color={color} size={size} />
                }}
            />

            <Tab.Screen
                name="List"
                component={ListStackNavigator}
                options={{ tabBarIcon: ({ color, size }) => <Icon name="list" color={color} size={size} /> }}
            />
            <Tab.Screen
                name="CuratedCorner"
                component={CuratedCornerStackNavigator}
                options={{
                    tabBarLabel: 'The Corner',
                    tabBarIcon: ({ color, size }) => <Icon name="diamond" color={color} size={size} />
                }}
            />
            <Tab.Screen
                name="Search"
                component={SearchStackNavigator}
                options={{ tabBarIcon: ({ color, size }) => <Icon name="search" color={color} size={size} /> }}
            />
        </Tab.Navigator>
    );
}

function AppNavigator() {
    const [notification, setNotification] = useState(false);
    const notificationListener = useRef();
    const responseListener = useRef();

    useEffect(() => {
        // Listeners for incoming notifications
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            setNotification(notification);
        });

        // Listener for user tapping on notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            console.log(response);
            // In a real app, navigate based on response.notification.request.content.data
        });

        // Request permissions and get token on app launch
        registerForPushNotificationsAsync();

        return () => {
            Notifications.removeNotificationSubscription(notificationListener.current);
            Notifications.removeNotificationSubscription(responseListener.current);
        };
    }, []);

    return (
        <MusicProvider>
            <NavigationContainer>
                <Stack.Navigator initialRouteName="Login">
                    <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
                    <Stack.Screen name="SignUp" component={SignUpScreen} />
                    <Stack.Screen name="MainTabs" component={BottomTabs} options={{ headerShown: false }} />

                    <Stack.Screen name="ListDetails" component={ListDetailScreen} />
                    <Stack.Screen name="Profile" component={ProfileScreen} />
                    <Stack.Screen name="ProfileSettings" component={ProfileSettings} />
                    <Stack.Screen name="SearchScreen" component={SearchScreenMusic} />


                    <Stack.Screen name="AlbumDetails" component={AlbumDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="MovieDetails" component={AlbumDetailScreen} options={{ headerShown: false }} />

                    <Stack.Screen name="PublicProfile" component={PublicProfileScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FollowList" component={FollowListScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="RatingInstructions" component={RatingInstructionsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreateCuration" component={CreateCurationScreen} options={{ headerShown: false }} />
                </Stack.Navigator>
            </NavigationContainer>
        </MusicProvider>
    );
}

export default AppNavigator;
