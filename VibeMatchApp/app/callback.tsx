import React, { useEffect } from 'react';
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams, useRootNavigationState } from 'expo-router';

export default function CallbackScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    // 1. Check if the navigation state is actually defined
    const isReady = rootNavigationState?.key;

    if (isReady && code) {
      console.log("✅ Navigation ready. Sending code to Explore...");
      
      // 2. Added a 500ms delay to ensure the Root Layout is fully stable
      const timeout = setTimeout(() => {
        router.replace({
          pathname: '/explore',
          params: { authCode: code }
        });
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [code, rootNavigationState]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.text}>VERIFYING VIBE...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF007F', justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#CCFF00',
    padding: 40,
    borderWidth: 5,
    borderColor: '#000',
    alignItems: 'center',
    transform: [{ rotate: '-3deg' }],
    shadowColor: "#000",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  text: { color: '#000', marginTop: 20, fontWeight: '900', fontSize: 24, textTransform: 'uppercase' }
});