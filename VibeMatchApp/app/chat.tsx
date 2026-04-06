import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Linking, ImageBackground
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

const API_BASE_URL = 'https://insify.onrender.com';

export default function ChatScreen() {
  const { contact, me } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCallUrl, setActiveCallUrl] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const fetchHistory = async () => {
    if (!me || !contact) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/chat-history`, {
        params: { user_a: me, user_b: contact }
      });
      setMessages(res.data.data);
    } catch (error) {
      console.log("Error fetching history");
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 3000);
    return () => clearInterval(interval);
  }, [me, contact]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const tempMsg = {
      sender_name: me,
      receiver_name: contact,
      text: text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);
    setInputText('');

    try {
      await axios.post(`${API_BASE_URL}/send-message`, {
        sender_name: me,
        receiver_name: contact,
        text: text
      });
      fetchHistory();
    } catch (e) {
      console.log('Failed to send');
    }
  };

  const handleSharePlaylist = () => {
    const demoPlaylist = "https://open.spotify.com/playlist/0slB7jGwDA82k46zvVvoop?si=a82e4916db57431b";
    sendMessage(`Check out my vibe 🎵\n${demoPlaylist}`);
  };

  const handleAIIcebreaker = async () => {
    setIsGenerating(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/generate-icebreaker`, {
        params: { user_a: me, user_b: contact }
      });
      if (res.data.status === 'success') {
        setInputText(res.data.icebreaker);
      }
    } catch (error) {
      console.log("Error generating icebreaker");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBeef = async () => {
    setIsGenerating(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/generate-beef`, {
        params: { user_a: me, user_b: contact }
      });
      if (res.data.status === 'success') {
        setInputText(res.data.beef);
      }
    } catch (error) {
      console.log("Error generating beef");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCall = (type: 'Video' | 'Voice') => {
    // Ensure both users generate the exact same room ID regardless of who calls who
    const roomName = `VibeMatch_${[me as string, contact as string].sort().join('_').replace(/[^a-zA-Z0-9]/g, '')}`;
    const url = `https://meet.jit.si/${roomName}`;
    sendMessage(`Incoming ${type} Call! 📲\nJoin here: ${url}`);
    
    if (Platform.OS === 'web') {
      setActiveCallUrl(url);
    } else {
      Linking.openURL(url);
    }
  };

  const renderMessageText = (text: string, isMe: boolean) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
      <Text style={[styles.msgText, isMe ? styles.myMsgText : styles.theirMsgText]}>
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            const isSpotify = part.includes('spotify.com') || part.includes('spotify:');
            return (
              <Text 
                key={i} 
                style={[styles.link, isSpotify && styles.spotifyLink, part.includes('meet.jit.si') && styles.callLink]} 
                onPress={() => {
                  if (part.includes('meet.jit.si') && Platform.OS === 'web') {
                    setActiveCallUrl(part);
                  } else {
                    Linking.openURL(part);
                  }
                }}
              >
                {isSpotify ? '▶ Open in Spotify' : part.includes('meet.jit.si') ? '📞 TAP TO JOIN CALL IN-APP' : part}
              </Text>
            );
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  };

  const renderMessage = ({ item, index }: { item: any, index: number }) => {
    const isMe = item.sender_name === me;
    const rotate = index % 2 === 0 ? '-1deg' : '1deg';
    return (
      <View style={[styles.msgWrapper, isMe ? styles.myMsg : styles.theirMsg, { transform: [{ rotate }] }]}>
        {!isMe && <Text style={styles.senderLabel}>{contact}</Text>}
        {renderMessageText(item.text, isMe)}
        <View style={styles.tapeSmall} />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ImageBackground
        source={require('../assets/images/wavy_bg.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,0,127,0.3)' }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{contact}</Text>
          <Text style={styles.headerSub}>VIBE MATCH CHAT</Text>
        </View>
        <View style={{flexDirection: 'row', gap: 6}}>
          <TouchableOpacity style={[styles.callBtn, {backgroundColor: '#FF007F'}]} onPress={() => handleCall('Video')}>
            <Text style={styles.callBtnText}>📹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.callBtn, {backgroundColor: '#1DB954'}]} onPress={() => handleCall('Voice')}>
            <Text style={styles.callBtnText}>📞</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={styles.stickerFeature}>
              <Text style={styles.emptyChatEmoji}>🎵</Text>
            </View>
            <Text style={styles.emptyChatTitle}>NO MESSAGES</Text>
            <Text style={styles.emptyChatText}>Say hi or share a playlist!</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputArea}>
        <TouchableOpacity style={styles.playlistBtn} onPress={handleSharePlaylist}>
          <Text style={styles.playlistBtnText}>🎵</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aiBtn, isGenerating && { opacity: 0.7 }]}
          onPress={handleAIIcebreaker}
          disabled={isGenerating}
        >
          <Text style={styles.aiBtnText}>{isGenerating ? '...' : '✨'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aiBtn, { backgroundColor: '#FF0000', borderColor: '#FFF' }, isGenerating && { opacity: 0.7 }]}
          onPress={handleBeef}
          disabled={isGenerating}
        >
          <Text style={styles.aiBtnText}>{isGenerating ? '...' : '🥊'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="TYPE A MESSAGE..."
          placeholderTextColor="#555"
          onSubmitEditing={() => sendMessage(inputText)}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={() => sendMessage(inputText)}>
          <Text style={styles.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>

      {activeCallUrl && Platform.OS === 'web' && (
        <View style={[{...StyleSheet.absoluteFillObject}, { zIndex: 1000, backgroundColor: '#000' }]}>
          <TouchableOpacity style={styles.hangUpBtn} onPress={() => setActiveCallUrl(null)}>
            <Text style={styles.hangUpText}>❌ END CALL & HEAD BACK TO CHAT</Text>
          </TouchableOpacity>
          {React.createElement('iframe', {
            src: `${activeCallUrl}#config.prejoinPageEnabled=false`,
            style: { width: '100%', height: 'calc(100% - 60px)', border: 'none' },
            allow: "camera; microphone; fullscreen; display-capture"
          })}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF007F' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 5, borderBottomColor: '#000',
    backgroundColor: '#FFF',
  },
  backBtn: {
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#000', backgroundColor: '#00FFFF', transform: [{ rotate: '-2deg' }],
    shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0,
  },
  backText: { color: '#000', fontWeight: '900', fontSize: 16 },
  headerCenter: { alignItems: 'center', backgroundColor: '#CCFF00', paddingHorizontal: 16, paddingVertical: 8, borderWidth: 4, borderColor: '#000', transform: [{ rotate: '1deg' }], shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 },
  headerName: { fontSize: 20, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
  headerSub: { fontSize: 12, color: '#000', fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  callBtn: {
    paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', 
    borderWidth: 3, borderColor: '#000', transform: [{rotate: '2deg'}],
    shadowColor: '#000', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0,
  },
  callBtnText: { color: '#FFF', fontSize: 16 },

  listContent: { padding: 16, flexGrow: 1, paddingBottom: 40 },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  stickerFeature: {
    padding: 16, alignItems: 'center', justifyContent: 'center', width: 100, height: 100,
    borderWidth: 4, borderColor: '#000', borderRadius: 50, backgroundColor: '#CCFF00',
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
    transform: [{ rotate: '-3deg' }], marginBottom: 16,
  },
  emptyChatEmoji: { fontSize: 48 },
  emptyChatTitle: { fontSize: 28, fontWeight: '900', color: '#FFF', textShadowColor: '#000', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0, marginBottom: 8 },
  emptyChatText: { fontSize: 16, color: '#000', fontWeight: '900', backgroundColor: '#FFF', padding: 12, borderWidth: 3, borderColor: '#000', transform: [{ rotate: '2deg' }] },

  senderLabel: { fontSize: 10, color: '#000', fontWeight: '900', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, backgroundColor: '#FFF', alignSelf: 'flex-start', paddingHorizontal: 4, borderWidth: 1, borderColor: '#000' },
  msgWrapper: {
    maxWidth: '80%', padding: 16, marginBottom: 16,
    borderWidth: 4, borderColor: '#000',
    shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
  },
  tapeSmall: {
    position: 'absolute', top: -10, left: '40%', width: 30, height: 15, backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2, borderColor: '#000', transform: [{ rotate: '-8deg' }]
  },
  myMsg: {
    alignSelf: 'flex-end', backgroundColor: '#00FFFF',
  },
  theirMsg: { alignSelf: 'flex-start', backgroundColor: '#FFF' },
  msgText: { fontSize: 16, lineHeight: 24, fontWeight: '800' },
  myMsgText: { color: '#000' },
  theirMsgText: { color: '#000' },
  link: { textDecorationLine: 'underline', color: '#FF007F' },
  spotifyLink: { color: '#FFF', backgroundColor: '#1DB954', paddingHorizontal: 6, fontWeight: '900', textDecorationLine: 'none', borderWidth: 2, borderColor: '#000' },
  callLink: { color: '#FFF', backgroundColor: '#FF0000', paddingHorizontal: 6, fontWeight: '900', textDecorationLine: 'none', borderWidth: 2, borderColor: '#000' },
  
  hangUpBtn: { backgroundColor: '#FF0000', padding: 16, alignItems: 'center', justifyContent: 'center', height: 60, borderWidth: 4, borderColor: '#FFF' },
  hangUpText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 2 },

  inputArea: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderTopWidth: 5, borderTopColor: '#000', backgroundColor: '#FFF',
  },
  playlistBtn: {
    width: 48, height: 48, backgroundColor: '#1DB954',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    borderWidth: 4, borderColor: '#000', transform: [{ rotate: '-3deg' }],
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  playlistBtnText: { fontSize: 24 },
  aiBtn: {
    width: 48, height: 48, backgroundColor: '#00FFFF',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    borderWidth: 4, borderColor: '#000', transform: [{ rotate: '3deg' }],
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  aiBtnText: { fontSize: 24, fontWeight: '900' },
  textInput: {
    flex: 1, height: 50, backgroundColor: '#FFF',
    paddingHorizontal: 16, fontSize: 16, color: '#000', fontWeight: '900',
    borderWidth: 4, borderColor: '#000',
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  sendBtn: {
    marginLeft: 12, width: 48, height: 48, backgroundColor: '#FF007F',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#000', transform: [{ rotate: '2deg' }],
    shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  sendBtnText: { color: '#FFF', fontWeight: '900', fontSize: 24 },
});
