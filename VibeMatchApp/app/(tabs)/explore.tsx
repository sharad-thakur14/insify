import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  ActivityIndicator, 
  TouchableOpacity, 
  ImageBackground, 
  RefreshControl,
  Alert,
  Image 
} from 'react-native';
import axios from 'axios';
import { useAuthRequest } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// ✅ IMPORT THE STORE
import { useMatchStore } from '../../store/useMatchStore';

WebBrowser.maybeCompleteAuthSession();

interface MatchUser {
  name: string;
  display_name?: string;
  profile_pic?: string;
  age: number;
  vibe_score: number;
  top_artists: string;
  breakdown?: {
    artist_match: number;
    genre_match: number;
  };
  common_artists?: string[];
  top_tracks?: string[];
}

const SPOTIFY_CLIENT_ID = '26da15706e304db08c3b7ae991943759';
const API_BASE_URL = 'http://127.0.0.1:8000';

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export default function ExploreScreen() {
  const { authCode, user } = useLocalSearchParams();
  const [matches, setMatches] = useState<MatchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  // ✅ INITIALIZE THE STORE ACTION
  const setSelectedMatch = useMatchStore((state) => state.setSelectedMatch);
  
  const currentMe = typeof user === 'string' ? user : 'Sharad Thakur';
  const redirectUri = "http://127.0.0.1:8081/callback";

  const [request, response, promptAsync] = useAuthRequest({
    clientId: SPOTIFY_CLIENT_ID,
    scopes: ['user-top-read'],
    redirectUri: redirectUri,
  }, discovery);

  const handleSpotifySync = async (token: string) => {
    setLoading(true);
    try {
      console.log("📡 Sending token to Python backend for:", currentMe);
      const res = await axios.post(`${API_BASE_URL}/sync-spotify`, {
        user_name: currentMe,
        token: token
      });
      
      if (res.data.status === 'success') {
        Alert.alert("Success", "✅ Music Synced! Your matches are now real.");
        fetchMatches(); 
      }
    } catch (e) {
      console.error("❌ Sync failed:", e);
      Alert.alert("Sync Error", "Check if your Python backend is running at :8000");
    } finally {
      setLoading(false);
    }
  };

  const finishHandshake = async (code: string) => {
    setLoading(true);
    try {
      if (response?.type === 'success' && response.params.access_token) {
        handleSpotifySync(response.params.access_token);
      } else {
        handleSpotifySync(code); 
      }
    } catch (e) {
      console.error("Handshake failed", e);
    }
  };

  useEffect(() => {
    if (authCode) {
      console.log("🚀 Auth Code detected, finishing handshake...");
      finishHandshake(authCode.toString());
    }
  }, [authCode]);

  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      console.log("🔑 Popup Token Received:", access_token);
      handleSpotifySync(access_token);
    }
  }, [response]);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/matches?user_name=${currentMe}`);
      if (res.data.matches) {
        setMatches(res.data.matches);
      }
    } catch (e) {
      console.error("❌ API Error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMatches();
  };

  return (
    <View style={styles.container}>
      <ImageBackground 
        source={require('../../assets/images/wavy_bg.png')} 
        style={StyleSheet.absoluteFillObject} 
      />
      
      <View style={styles.headerBox}>
        <Text style={styles.headerText}>DISCOVER</Text>
      </View>
      
      {/* 🎵 SECTION 1: SPOTIFY SYNC */}
      <TouchableOpacity 
        style={styles.syncBtn} 
        onPress={() => promptAsync()} 
        disabled={!request}
      >
        <Text style={styles.syncBtnText}>🎵 SYNC SPOTIFY</Text>
      </TouchableOpacity>

      {/* 🎙️ SECTION 2: HOSTING */}
      <TouchableOpacity 
        style={[styles.syncBtn, { backgroundColor: '#CCFF00', marginTop: 0 }]} 
        onPress={() => {
          router.push({
            pathname: '/live',
            params: { roomName: currentMe, userName: currentMe }
          });
        }}
      >
        <Text style={[styles.syncBtnText, { color: '#000' }]}>🎙️ HOST A DJ ROOM</Text>
      </TouchableOpacity>

      {loading && !refreshing && (
        <ActivityIndicator size="large" color="#CCFF00" style={{ marginTop: 20 }} />
      )}

      {/* 🎧 SECTION 3: JOINING MATCHES */}
      <FlatList 
        data={matches} 
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#CCFF00" />
        }
        renderItem={({ item }) => (
          <View style={styles.matchRow}>
            {/* 📞 LEFT SIDE: CHAT & VC (Now using Zustand) */}
            <TouchableOpacity 
              style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
              onPress={() => {
                // 🚀 Save the whole "Suitcase" here to the store
                setSelectedMatch(item); 
                
                // 🧹 Navigate with a clean URL (no long JSON strings)
                router.push({ 
                  pathname: '/chat', 
                  params: { 
                    contact: item.name, 
                    user: currentMe 
                  } 
                });
              }}
            >
              <Image 
                source={{ uri: item.profile_pic || 'https://via.placeholder.com/150' }} 
                style={styles.avatar} 
              />
              <View style={{ marginLeft: 15 }}>
                <Text style={styles.matchName}>{item.name}, {item.age}</Text>
                <Text style={styles.artistList}>Tap to Chat & Call 📞</Text>
              </View>
            </TouchableOpacity>

            {/* 🎧 RIGHT SIDE: JOIN DJ ROOM */}
            <TouchableOpacity 
              style={styles.scoreBadge}
              onPress={() => {
                router.push({
                  pathname: '/live',
                  params: { roomName: item.name, userName: currentMe }
                });
              }}
            >
              <Text style={styles.matchScore}>{item.vibe_score}%</Text>
              <Text style={{color: '#CCFF00', fontSize: 8, textAlign: 'center', fontWeight: '900'}}>JOIN DJ</Text>
            </TouchableOpacity>
          </View>
        )}
        keyExtractor={(item, i) => i.toString()}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={
          !loading ? <Text style={styles.statusMsg}>NO MATCHES FOUND. SYNC YOUR MUSIC!</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF007F' },
  headerBox: { 
    alignSelf: 'center', backgroundColor: '#CCFF00', padding: 10, 
    borderWidth: 5, borderColor: '#000', transform: [{ rotate: '2deg' }], 
    marginTop: 60, zIndex: 10
  },
  headerText: { fontSize: 32, fontWeight: '900', color: '#000' },
  syncBtn: { 
    backgroundColor: '#1DB954', margin: 20, padding: 15, borderWidth: 4, 
    borderColor: '#000', alignItems: 'center', shadowColor: "#000",
    shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
  },
  syncBtnText: { fontWeight: '900', fontSize: 18, color: '#fff' },
  statusMsg: { 
    textAlign: 'center', backgroundColor: '#FFF', padding: 15, marginTop: 50,
    borderWidth: 3, borderColor: '#000', fontWeight: '900' 
  },
  matchRow: { 
    backgroundColor: '#FFF', padding: 15, borderWidth: 4, borderColor: '#000', 
    marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1, shadowRadius: 0,
  },
  avatar: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    borderWidth: 3, 
    borderColor: '#000',
    backgroundColor: '#eee'
  },
  matchName: { fontWeight: '900', fontSize: 18, color: '#000' },
  artistList: { fontWeight: '600', fontSize: 12, color: '#666', marginTop: 4 },
  scoreBadge: { backgroundColor: '#000', padding: 8, borderRadius: 5 },
  matchScore: { fontWeight: '900', color: '#CCFF00', fontSize: 16 }
});