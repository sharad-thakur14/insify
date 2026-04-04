import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Image, Platform, useWindowDimensions, ImageBackground } from 'react-native';
import axios from 'axios';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import Animated, { FadeIn, FadeInUp, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, Tabs } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_CLIENT_ID = '26da15706e304db08c3b7ae991943759';
const API_BASE_URL = 'https://insify.onrender.com';

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

// Simplified flow: landing → finding-matches → matches
type AppStep = 'landing' | 'finding-matches' | 'matches';

export default function App() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<AppStep>('landing');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');

  // Continuous wiggling animation for sticker elements
  const rotation = useSharedValue(-2);
  useEffect(() => {
    rotation.value = withRepeat(
      withSequence(
        withTiming(2, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(-2, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStickerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const redirectUri = Platform.OS === 'web'
    ? window.location.origin + '/'
    : makeRedirectUri({ scheme: 'vibematch' });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: ['user-top-read'],
      usePKCE: true,
      redirectUri: redirectUri,
    },
    discovery
  );

  // Check if user already logged in
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('loggedInUser');
      if (stored) {
        setLoggedInUser(stored);
        setCurrentStep('matches');
        fetchMatches(stored);
      }
    })();
  }, []);

  // Spotify callback
  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      completeWithSpotify(access_token);
    } else if (response?.type === 'error') {
      setLoading(false);
      Alert.alert("Spotify Failed", response.error?.message || 'Unknown error');
    }
  }, [response]);

  const handleConnectSpotify = () => {
    setLoading(true);
    promptAsync();
    setTimeout(() => { setLoading(false); }, 10000);
  };

  const completeWithSpotify = async (token: string) => {
    try {
      const spotRes = await axios.get('https://api.spotify.com/v1/me/top/artists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const artists = spotRes.data.items.map((a: any) => a.name);
      const meRes = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const displayName = meRes.data.display_name || 'Listener';

      await registerAndMatch(displayName, artists);
    } catch (error: any) {
      Alert.alert("Error", "Could not fetch Spotify data.");
      setLoading(false);
    }
  };

  const skipSpotifyDemo = async () => {
    setLoading(true);
    const demoName = 'Parth';
    const demoArtists = ['Pritam', 'Arijit Singh', 'KK', 'Shaan', 'Atif Aslam', 'Darshan Raval'];
    await registerAndMatch(demoName, demoArtists);
  };

  const registerAndMatch = async (userName: string, artists: string[]) => {
    try {
      await axios.post(`${API_BASE_URL}/register`, {
        name: userName,
        age: 24,
        gender: 'Other',
        top_artists: artists,
        latitude: 28.6139,
        longitude: 77.2090,
      });
      await AsyncStorage.setItem('loggedInUser', userName);
      setLoggedInUser(userName);
      setCurrentStep('finding-matches');

      // Simulate matchmaking animation
      setTimeout(async () => {
        await fetchMatches(userName);
        setCurrentStep('matches');
      }, 2500);
    } catch (error: any) {
      Alert.alert("Error", error?.response?.data?.detail || "Registration failed.");
      setLoading(false);
    }
  };

  const fetchMatches = async (userName: string) => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE_URL}/matches?user_name=${encodeURIComponent(userName)}&max_distance_km=10`
      );
      setMatches(res.data.data);
    } catch (err) {
      Alert.alert("Error", "Could not fetch matches.");
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('loggedInUser');
    setLoggedInUser('');
    setMatches([]);
    setCurrentStep('landing');
  };

  const getScoreEmoji = (score: number) => {
    if (score >= 60) return '🔥';
    if (score >= 40) return '⚡';
    if (score >= 20) return '✨';
    return '🎵';
  };

  const renderMatchCard = ({ item, index }: { item: any, index: number }) => {
    const isEven = index % 2 === 0;
    const rotate = isEven ? '-1.5deg' : '1.5deg';
    const cardColor = isEven ? '#FFF' : '#CCFF00';
    
    return (
      <Animated.View entering={FadeInUp.delay(100).springify()} style={[styles.card, { backgroundColor: cardColor, transform: [{rotate}], position: 'relative' }]}>
        {item.is_most_compatible && (
          <View style={{ position: 'absolute', top: -14, left: 16, zIndex: 10, backgroundColor: '#000', paddingVertical: 6, paddingHorizontal: 12, transform: [{rotate: '-3deg'}], borderWidth: 3, borderColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 }}>
            <Text style={{ color: '#00FFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 }}>🏆 MOST COMPATIBLE</Text>
          </View>
        )}
        <View style={styles.cardTop}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{item.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardMeta}>{item.age} · {item.gender} · {item.distance_km ?? '<1'}km away</Text>
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scoreNum}>{getScoreEmoji(item.compatibility_score)} {item.compatibility_score}%</Text>
          </View>
        </View>

        {item.shared_artists?.length > 0 && (
          <View style={styles.chipRow}>
            {item.shared_artists.slice(0, 4).map((artist: string, i: number) => (
              <View key={i} style={[styles.chip, { transform: [{rotate: i % 2 === 0 ? '-2deg' : '3deg'}] }]}>
                <Text style={styles.chipText}>🎵 {artist}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.ideaSection}>
          <View style={styles.tapeSmall} />
          <Text style={styles.ideaLabel}>DATE IDEA</Text>
          <Text style={styles.ideaBody}>📍 {item.ai_outing_suggestion}</Text>
        </View>

        <TouchableOpacity
          style={styles.chatBtn}
          activeOpacity={0.8}
          onPress={() => {
            router.push({ pathname: '/chat', params: { contact: item.name, me: loggedInUser } });
          }}
        >
          <Text style={styles.chatBtnText}>💬  START CHATTING</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ========================================
  // LANDING — Wavy Psychedelic Zine UI
  // ========================================
  if (currentStep === 'landing') {
    return (
      <View style={[styles.landingWrap, { paddingTop: insets.top }]}>
        <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
        <ImageBackground 
          source={require('../../assets/images/wavy_bg.png')} 
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        
        {/* Semi-transparent overlay to ensure text is readable but keeps the wild vibe */}
        <View style={{...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,0,127,0.3)'}} />

        <ScrollView contentContainerStyle={styles.landingScroll} showsVerticalScrollIndicator={false}>
          
          <Animated.View entering={FadeIn.duration(600)} style={styles.heroSection}>
            <Animated.View style={animatedPulseStyle}>
              <Image
                source={require('../../assets/images/punk_hero.png')}
                style={[styles.heroImg, { height: Math.min(height * 0.35, 300) }]}
                resizeMode="contain"
              />
            </Animated.View>
            <Animated.Image 
              source={require('../../assets/images/eye_sticker.png')}
              style={[styles.eyeSticker, animatedStickerStyle]}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.brandSection}>
            <View style={styles.titleBox}>
              <Text style={styles.brandName}>VIBEMATCH</Text>
            </View>
            <View style={styles.taglineBadge}>
              <Text style={styles.taglineText}>NO SMALL TALK.</Text>
              <Text style={styles.taglineTextZany}>JUST MUSIC.</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.storySection}>
            <View style={styles.storyCard}>
              <View style={styles.tape} />
              <Text style={styles.storyTitle}>BE HONEST WITH YOUR INTENTIONS</Text>
              <Text style={styles.storyBody}>
                Connect with people who stream what you stream — within 10km of you. 
                We use your Spotify listening history to find your perfect vibe match. 
                No ghosting, no boring bios. Just pure musical chemistry.
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.featureRow}>
            <Animated.View style={[styles.stickerFeature, animatedStickerStyle, { backgroundColor: '#CCFF00', transform: [{rotate: '-4deg'}] }]}>
              <Text style={styles.featureEmoji}>🎧</Text>
              <Text style={styles.featureTitle}>MUSIC-FIRST</Text>
            </Animated.View>
            <Animated.View style={[styles.stickerFeature, animatedPulseStyle, { backgroundColor: '#00FFFF', transform: [{rotate: '3deg'}] }]}>
              <Text style={styles.featureEmoji}>📍</Text>
              <Text style={styles.featureTitle}>NEARBY</Text>
            </Animated.View>
            <Animated.View style={[styles.stickerFeature, animatedStickerStyle, { backgroundColor: '#FF5500', transform: [{rotate: '-2deg'}] }]}>
              <Text style={styles.featureEmoji}>💬</Text>
              <Text style={styles.featureTitle}>REAL TALK</Text>
            </Animated.View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(600).springify()} style={styles.ctaSection}>
            <TouchableOpacity
              style={[styles.spotifyBtn, (!request || loading) && styles.btnDisabled]}
              onPress={handleConnectSpotify}
              disabled={loading || !request}
              activeOpacity={0.9}
            >
              {loading ? <ActivityIndicator color="#000" size="large" /> : (
                <Text style={styles.spotifyBtnText}>🎵 CONNECT SPOTIFY & START</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoBtn}
              onPress={skipSpotifyDemo}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Text style={styles.demoBtnText}>TRY DEMO MODE →</Text>
            </TouchableOpacity>

            <Text style={styles.footerNote}>
              WE ONLY READ YOUR TOP ARTISTS. NOTHING ELSE.
            </Text>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ========================================
  // FINDING MATCHES — Animated transition
  // ========================================
  if (currentStep === 'finding-matches') {
    return (
      <View style={styles.findingWrap}>
        <Tabs.Screen options={{ tabBarStyle: { display: 'none' } }} />
        <ImageBackground 
          source={require('../../assets/images/wavy_bg.png')} 
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={{...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,0,127,0.3)'}} />
        
        <Animated.View entering={FadeIn.duration(500)} style={styles.findingCard}>
          <View style={styles.tapeFinding} />
          
          <Animated.View style={[styles.findingSticker, animatedStickerStyle]}>
            <Text style={styles.findingEmoji}>💿</Text>
          </Animated.View>
          
          <View style={styles.findingTitleBox}>
            <Animated.Text style={[styles.findingTitle, animatedPulseStyle]}>FINDING VIBES</Animated.Text>
          </View>
          
          <Text style={styles.findingSub}>SCANNING EXPERT MUSIC LOVERS WITHIN 10KM</Text>
          
          <View style={styles.finderDots}>
            <View style={[styles.dot, { backgroundColor: '#FF007F' }]} />
            <View style={[styles.dot, { backgroundColor: '#CCFF00' }]} />
            <View style={[styles.dot, { backgroundColor: '#00FFFF' }]} />
          </View>
        </Animated.View>
      </View>
    );
  }

  // ========================================
  // MATCHES — Results
  // ========================================
  return (
    <View style={styles.matchesWrap}>
      <Tabs.Screen options={{ 
        tabBarStyle: {
          backgroundColor: '#0D0D0D', 
          borderTopColor: '#222', 
          borderTopWidth: 2, 
          elevation: 0, 
          shadowOpacity: 0, 
          height: 60, 
          paddingBottom: 8, 
          display: 'flex' 
        } 
      }} />
      <ImageBackground 
        source={require('../../assets/images/wavy_bg.png')} 
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <View style={{...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,0,127,0.3)'}} />

      <View style={[styles.matchesHeader, { paddingTop: insets.top + 12 }]}>
        <View style={styles.matchesHeaderTop}>
          <View style={styles.matchesHeaderZanyBox}>
            <Text style={styles.matchesGreet}>HEY {loggedInUser.toUpperCase()} 👋</Text>
            <Text style={styles.matchesSub}>PEOPLE NEAR YOU WHO VIBE WITH YOUR MUSIC</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 40 }} />
      ) : matches.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Animated.View style={[styles.stickerFeature, { backgroundColor: '#FF007F' }, animatedStickerStyle]}>
            <Text style={styles.emptyEmoji}>🎧</Text>
          </Animated.View>
          <Text style={styles.emptyTitle}>NO MATCHES YET</Text>
          <Text style={styles.emptySub}>More music lovers are joining — check back soon!</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          renderItem={renderMatchCard}
          contentContainerStyle={[styles.matchesList, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ============================================================
// STYLES — Refined neo-brutalist with better color balance
// ============================================================
const styles = StyleSheet.create({
  // ---- LANDING ZINE STYLES ----
  landingWrap: { flex: 1, backgroundColor: '#FF007F' }, // fallback color
  landingScroll: { flexGrow: 1, paddingBottom: 80 },
  heroSection: { alignItems: 'center', paddingTop: 20 },
  heroImg: { width: '100%', transform: [{rotate: '2deg'}], shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20 },
  eyeSticker: { position: 'absolute', top: 40, right: 20, width: 80, height: 80, zIndex: 10 },
  
  brandSection: { alignItems: 'center', marginTop: -20, zIndex: 5 },
  titleBox: {
    backgroundColor: '#CCFF00', paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 6, borderColor: '#000', transform: [{rotate: '-3deg'}],
    shadowColor: '#000', shadowOffset: { width: 8, height: 8 }, shadowOpacity: 1, shadowRadius: 0,
  },
  brandName: { fontSize: 56, fontWeight: '900', color: '#000', letterSpacing: 2 },
  
  taglineBadge: {
    marginTop: 16, backgroundColor: '#00FFFF', paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 4, borderColor: '#000', transform: [{rotate: '2deg'}],
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
  },
  taglineText: { color: '#000', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  taglineTextZany: { color: '#FF007F', fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, marginTop: 4, textAlign: 'center' },

  storySection: { paddingHorizontal: 24, marginTop: 40 },
  storyCard: {
    backgroundColor: '#FFF', borderWidth: 5, borderColor: '#000', padding: 24,
    shadowColor: '#000', shadowOffset: { width: 10, height: 10 }, shadowOpacity: 1, shadowRadius: 0,
    transform: [{rotate: '-1deg'}]
  },
  tape: {
    position: 'absolute', top: -15, left: '40%', width: 80, height: 30, backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1, borderColor: '#ccc', transform: [{rotate: '-5deg'}]
  },
  storyTitle: { fontSize: 26, fontWeight: '900', color: '#FF007F', marginBottom: 12, lineHeight: 30, textTransform: 'uppercase' },
  storyBody: { fontSize: 16, color: '#000', lineHeight: 26, fontWeight: '800' },

  featureRow: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 40, gap: 12, justifyContent: 'center' },
  stickerFeature: {
    padding: 16, alignItems: 'center', justifyContent: 'center', width: 100, height: 100,
    borderWidth: 4, borderColor: '#000', borderRadius: 50, // make them circle stickers
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
  },
  featureEmoji: { fontSize: 32, marginBottom: 4 },
  featureTitle: { fontSize: 12, fontWeight: '900', color: '#000', letterSpacing: 1, textAlign: 'center' },

  ctaSection: { paddingHorizontal: 24, marginTop: 50, alignItems: 'center' },
  spotifyBtn: {
    width: '100%', backgroundColor: '#CCFF00', paddingVertical: 24, alignItems: 'center',
    borderWidth: 6, borderColor: '#000', transform: [{rotate: '1deg'}],
    shadowColor: '#000', shadowOffset: { width: 8, height: 8 }, shadowOpacity: 1, shadowRadius: 0,
  },
  spotifyBtnText: { color: '#000', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  
  demoBtn: {
    marginTop: 24, backgroundColor: '#FFF', paddingVertical: 14, paddingHorizontal: 32,
    borderWidth: 4, borderColor: '#000', transform: [{rotate: '-2deg'}],
    shadowColor: '#000', shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0,
  },
  demoBtnText: { color: '#000', fontSize: 16, fontWeight: '900' },
  btnDisabled: { opacity: 0.7 },
  footerNote: { marginTop: 24, fontSize: 13, color: '#000', textAlign: 'center', fontWeight: '900', letterSpacing: 1, backgroundColor: '#FFF', padding: 8, borderWidth: 2, borderColor: '#000', transform: [{rotate: '1deg'}] },

  // ---- FINDING MATCHES ----
  findingWrap: { flex: 1, backgroundColor: '#FF007F', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  findingCard: { 
    backgroundColor: '#FFF', borderWidth: 6, borderColor: '#000', padding: 30, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 10, height: 10 }, shadowOpacity: 1, shadowRadius: 0,
    transform: [{rotate: '1deg'}], width: '100%'
  },
  tapeFinding: {
    position: 'absolute', top: -15, left: '45%', width: 80, height: 30, backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2, borderColor: '#000', transform: [{rotate: '-5deg'}]
  },
  findingSticker: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#CCFF00', borderWidth: 4, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
  },
  findingEmoji: { fontSize: 50 },
  findingTitleBox: {
    backgroundColor: '#00FFFF', paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 4, borderColor: '#000', transform: [{rotate: '-2deg'}], marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  findingTitle: {
    fontSize: 24, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 2,
  },
  findingSub: { fontSize: 16, color: '#000', marginTop: 8, fontWeight: '900', textAlign: 'center', backgroundColor: '#CCFF00', padding: 8, borderWidth: 3, borderColor: '#000', transform: [{rotate: '1deg'}] },
  finderDots: { flexDirection: 'row', gap: 12, marginTop: 24 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#000' },

  // ---- MATCHES ZINE STYLES ----
  matchesWrap: { flex: 1, backgroundColor: '#FF007F' },
  matchesHeader: { paddingHorizontal: 20, paddingBottom: 16 },
  matchesHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  matchesHeaderZanyBox: {
    backgroundColor: '#00FFFF', paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 4, borderColor: '#000', transform: [{rotate: '-2deg'}],
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
    flex: 1, marginRight: 16,
  },
  matchesGreet: { fontSize: 24, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
  matchesSub: { fontSize: 13, color: '#000', marginTop: 4, fontWeight: '900', letterSpacing: 0.5 },
  
  logoutBtn: {
    width: 44, height: 44, backgroundColor: '#FFF', borderWidth: 4, borderColor: '#000', 
    alignItems: 'center', justifyContent: 'center', transform: [{rotate: '3deg'}],
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  logoutText: { color: '#000', fontSize: 18, fontWeight: '900' },
  matchesList: { paddingHorizontal: 16, paddingTop: 16 },

  card: {
    borderWidth: 5, borderColor: '#000', padding: 20, marginBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 8, height: 8 }, shadowOpacity: 1, shadowRadius: 0,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FF007F',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#000', transform: [{rotate: '-5deg'}],
  },
  avatarLetter: { color: '#FFF', fontSize: 26, fontWeight: '900' },
  cardName: { fontSize: 24, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
  cardMeta: { fontSize: 14, color: '#000', fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  
  scorePill: {
    backgroundColor: '#FF007F', paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 4, borderColor: '#000', transform: [{rotate: '4deg'}],
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  scoreNum: { fontSize: 16, fontWeight: '900', color: '#FFF' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  chip: {
    backgroundColor: '#FFF', paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 3, borderColor: '#000',
    shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0,
  },
  chipText: { fontSize: 13, color: '#000', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },

  ideaSection: {
    backgroundColor: '#1DB954', padding: 16, borderWidth: 4, borderColor: '#000',
    marginBottom: 20, transform: [{rotate: '1deg'}],
  },
  tapeSmall: {
    position: 'absolute', top: -10, left: 10, width: 40, height: 20, backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2, borderColor: '#000', transform: [{rotate: '-8deg'}]
  },
  ideaLabel: {
    fontSize: 12, color: '#000', fontWeight: '900', letterSpacing: 2, marginBottom: 8,
    backgroundColor: '#FFF', paddingHorizontal: 6, paddingVertical: 4, alignSelf: 'flex-start', borderWidth: 2, borderColor: '#000',
  },
  ideaBody: { fontSize: 16, color: '#000', fontWeight: '900', lineHeight: 22 },

  chatBtn: {
    backgroundColor: '#00FFFF', paddingVertical: 18, alignItems: 'center',
    borderWidth: 5, borderColor: '#000', transform: [{rotate: '-1deg'}],
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
  },
  chatBtnText: { color: '#000', fontSize: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 50, marginBottom: 0 },
  emptyTitle: { fontSize: 32, fontWeight: '900', color: '#FFF', marginBottom: 12, marginTop: 24, textShadowColor: '#000', textShadowOffset: {width: 4, height: 4}, textShadowRadius: 0 },
  emptySub: { fontSize: 16, color: '#000', textAlign: 'center', fontWeight: '900', lineHeight: 24, backgroundColor: '#FFF', padding: 12, borderWidth: 3, borderColor: '#000', transform: [{rotate: '-2deg'}] },
});